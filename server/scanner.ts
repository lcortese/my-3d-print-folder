import { promises as fs } from 'node:fs'
import type { Dirent } from 'node:fs'
import path from 'node:path'
import type { CreatedSource } from '../shared/types.ts'

/** A model file discovered during a scan. */
export interface ScannedModel {
  name: string
  relPath: string
  ext: string
  bytes: number
  /** File creation time, resolved with the same fallback used everywhere. */
  createdAt: number
  createdSource: CreatedSource
  /** Last modification time of the file. */
  modifiedAt: number
}

/** A folder that directly contains at least one model file. */
export interface ScannedProject {
  category: string
  name: string
  relPath: string
  absPath: string
  depth: number
  modelCount: number
  modelBytes: number
  createdAt: number
  modifiedAt: number
  createdSource: CreatedSource
  models: ScannedModel[]
}

/** Every directory of the tree, used to serve the navigator lazily. */
export interface ScannedDir {
  path: string
  /** Parent folder, or null for the root itself. */
  parent: string | null
  name: string
  depth: number
  hasChildren: boolean
  /** Projects contained in this folder and all of its subfolders. */
  projectCount: number
}

export interface ScanOutput {
  root: string
  projects: ScannedProject[]
  dirs: ScannedDir[]
  warnings: string[]
}

export interface ScanOptions {
  root: string
  modelExtensions: readonly string[]
  ignoreDirs: ReadonlySet<string>
  maxDirectories: number
  maxWarnings: number
  /** Directories read in parallel. Windows drives mounted in WSL are latency bound. */
  concurrency?: number
}

/** Bookkeeping used to accumulate project counters after the parallel walk. */
interface DirRecord {
  entry: ScannedDir
  parentPath: string | null
  /** Projects found directly in this folder (0 or 1). */
  ownProjects: number
  /** Projects found in this folder and its subtree. */
  subtreeProjects: number
  /** Child folders that still have to report back. */
  pendingChildren: number
  /** True once the subtree counter has been propagated upwards. */
  finalized: boolean
}

/** Cross platform relative path that always uses forward slashes. */
function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join('/')
}

/** Parent of a relative posix path ("" for the first level). */
function parentOf(relDir: string): string | null {
  if (relDir === '') return null
  const index = relDir.lastIndexOf('/')
  return index === -1 ? '' : relDir.slice(0, index)
}

/**
 * Resolve the "created at" timestamp of a file.
 *
 * A real birth time is used when the filesystem reports one. Linux mounts of
 * Windows drives (9p, `/mnt/d`) do not: there `ctime` is the moment the file was
 * copied or its metadata changed, which says nothing about the age of the
 * design, so the modification time is used as the creation proxy instead.
 * `ctime` stays only as a last resort, for a file without a modification time.
 */
function resolveCreatedAt(stat: { birthtimeMs: number; ctimeMs: number; mtimeMs: number }): {
  createdAt: number
  createdSource: CreatedSource
} {
  if (stat.birthtimeMs > 0) return { createdAt: stat.birthtimeMs, createdSource: 'birthtime' }
  if (stat.mtimeMs > 0) return { createdAt: stat.mtimeMs, createdSource: 'mtime' }
  return { createdAt: stat.ctimeMs, createdSource: 'ctime' }
}

/** Dates of a project, taken from the files it holds. */
interface ProjectDates {
  createdAt: number
  createdSource: CreatedSource
  modifiedAt: number
}

/**
 * Oldest creation and newest modification among the model files of a project.
 *
 * Returns undefined when there is no readable file to take the dates from.
 */
function projectDates(models: ScannedModel[]): ProjectDates | undefined {
  let createdAt: number | undefined
  let createdSource: CreatedSource = 'mtime'
  let modifiedAt: number | undefined

  for (const model of models) {
    if (createdAt === undefined || model.createdAt < createdAt) {
      createdAt = model.createdAt
      createdSource = model.createdSource
    }
    if (modifiedAt === undefined || model.modifiedAt > modifiedAt) {
      modifiedAt = model.modifiedAt
    }
  }

  if (createdAt === undefined || modifiedAt === undefined) return undefined
  return { createdAt, createdSource, modifiedAt }
}

/**
 * Last resort for a folder whose model files could not be read: its own
 * timestamps, with the same creation fallback used for files.
 */
async function folderDates(
  absDir: string,
  relDir: string,
  warn: (message: string) => void,
): Promise<ProjectDates | undefined> {
  try {
    const stat = await fs.stat(absDir)
    const { createdAt, createdSource } = resolveCreatedAt(stat)
    return { createdAt, createdSource, modifiedAt: stat.mtimeMs }
  } catch (error) {
    warn(`Cannot stat ${relDir || '.'}: ${(error as Error).message}`)
    return undefined
  }
}

/** True when the folder name must be skipped by the scanner. */
function isIgnored(name: string, ignoreDirs: ReadonlySet<string>): boolean {
  return name.startsWith('.') || ignoreDirs.has(name.toLowerCase())
}

/** Matching configured extension of a file name, or null. */
function extensionOf(name: string, modelExtensions: readonly string[]): string | null {
  const lower = name.toLowerCase()
  for (const ext of modelExtensions) {
    if (lower.endsWith(ext)) return ext
  }
  return null
}

/**
 * Walk the configured root folder and build the project catalogue.
 *
 * A folder is a project when it directly contains at least one model file; the
 * category is always the first path segment under the root.
 *
 * The walk is breadth first and parallel: a pool of workers pulls folders from
 * a queue, and project counters are accumulated bottom up once every child of a
 * folder has reported back. This keeps a library with several thousand folders
 * on a slow Windows mount reasonably fast.
 */
export async function scanModelsRoot(options: ScanOptions): Promise<ScanOutput> {
  const { root, modelExtensions, ignoreDirs, maxDirectories, maxWarnings } = options
  const concurrency = Math.max(1, options.concurrency ?? 16)

  const projects: ScannedProject[] = []
  const dirs: ScannedDir[] = []
  const records = new Map<string, DirRecord>()
  const warnings: string[] = []

  let visitedDirs = 0
  let limitReached = false

  /** Pending folder reads and the pool bookkeeping. */
  const queue: Array<{ absDir: string; relDir: string; depth: number }> = [
    { absDir: root, relDir: '', depth: 0 },
  ]
  let inFlight = 0

  const warn = (message: string): void => {
    if (warnings.length < maxWarnings) warnings.push(message)
  }

  /** Propagate a finished subtree counter up to the root. */
  const finalize = (relDir: string): void => {
    let current: string | null = relDir

    while (current !== null) {
      const record = records.get(current)
      if (!record) return
      // Guard against a folder reporting twice when a worker failed midway.
      if (record.finalized) return
      record.finalized = true

      // The folder's own project plus everything reported by its children.
      const value = record.subtreeProjects + record.ownProjects
      record.subtreeProjects = value
      record.entry.projectCount = value

      const parent = record.parentPath
      if (parent === null) return

      const parentRecord = records.get(parent)
      if (!parentRecord) return

      parentRecord.subtreeProjects += value
      parentRecord.pendingChildren -= 1
      if (parentRecord.pendingChildren > 0) return

      current = parent
    }
  }

  /** Scan a single folder: collect its models and queue its subfolders. */
  const processDir = async (absDir: string, relDir: string, depth: number): Promise<void> => {
    visitedDirs += 1

    const record: DirRecord = {
      entry: {
        path: relDir,
        parent: parentOf(relDir),
        name: depth === 0 ? path.basename(root) : path.basename(absDir),
        depth,
        hasChildren: false,
        projectCount: 0,
      },
      parentPath: parentOf(relDir),
      ownProjects: 0,
      subtreeProjects: 0,
      pendingChildren: 0,
      finalized: false,
    }
    records.set(relDir, record)

    let entries: Dirent[] = []
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch (error) {
      warn(`Cannot read ${relDir || '.'}: ${(error as Error).message}`)
    }

    const childDirs = entries.filter((entry) => entry.isDirectory() && !isIgnored(entry.name, ignoreDirs))
    const modelEntries: Array<{ name: string; ext: string }> = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ext = extensionOf(entry.name, modelExtensions)
      if (ext) modelEntries.push({ name: entry.name, ext })
    }

    // Model folders are the only ones that need folder timestamps and file stats.
    if (modelEntries.length > 0) {
      const modelResults = await Promise.all(
        modelEntries.map(async (entry) => {
          const absFile = path.join(absDir, entry.name)
          try {
            const stat = await fs.stat(absFile)
            const created = resolveCreatedAt(stat)
            return {
              name: entry.name,
              relPath: toPosix(path.relative(root, absFile)),
              ext: entry.ext,
              bytes: stat.size,
              createdAt: created.createdAt,
              createdSource: created.createdSource,
              modifiedAt: stat.mtimeMs,
            }
          } catch (error) {
            warn(`Cannot stat ${toPosix(path.relative(root, absFile))}: ${(error as Error).message}`)
            return null
          }
        }),
      )

      const models = modelResults
        .filter((model): model is ScannedModel => model !== null)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

      // A project is dated by its model files, never by the folder: a folder that
      // was moved, renamed or reorganised looks newer than the content it holds.
      // Creation is the oldest file, modification the newest one. The folder is
      // only a last resort, for when no file could be read.
      const dates = projectDates(models) ?? (await folderDates(absDir, relDir, warn))
      const firstSegment = relDir.includes('/') ? relDir.slice(0, relDir.indexOf('/')) : relDir

      if (dates === undefined) {
        warn(`No usable timestamp for ${relDir || '.'}: the folder is not catalogued`)
      } else {
        projects.push({
          category: firstSegment === '' ? '(root)' : firstSegment,
          name: path.basename(absDir) || root,
          relPath: relDir,
          absPath: absDir,
          depth,
          modelCount: models.length,
          modelBytes: models.reduce((total, model) => total + model.bytes, 0),
          createdAt: dates.createdAt,
          modifiedAt: dates.modifiedAt,
          createdSource: dates.createdSource,
          models,
        })

        record.ownProjects = 1
      }
    }

    // Queue the subfolders that still fit in the directory budget.
    const queued: Dirent[] = []
    for (const child of childDirs) {
      if (visitedDirs + queue.length + inFlight >= maxDirectories) {
        limitReached = true
        break
      }
      queued.push(child)
    }

    record.entry.hasChildren = childDirs.length > 0
    record.pendingChildren = queued.length

    if (queued.length === 0) {
      finalize(relDir)
      return
    }

    for (const child of queued) {
      queue.push({
        absDir: path.join(absDir, child.name),
        relDir: relDir === '' ? child.name : `${relDir}/${child.name}`,
        depth: depth + 1,
      })
    }
  }

  try {
    const rootStat = await fs.stat(root)
    if (!rootStat.isDirectory()) {
      throw new Error(`${root} is not a directory`)
    }
  } catch (error) {
    throw new Error(`MODELS_ROOT is not reachable (${root}): ${(error as Error).message}`)
  }

  const worker = async (): Promise<void> => {
    for (;;) {
      const task = queue.shift()
      if (!task) {
        if (inFlight === 0) return
        await new Promise((resolve) => setTimeout(resolve, 1))
        continue
      }

      inFlight += 1
      try {
        await processDir(task.absDir, task.relDir, task.depth)
      } catch (error) {
        warn(`Unexpected error in ${task.relDir || '.'}: ${(error as Error).message}`)
        finalize(task.relDir)
      } finally {
        inFlight -= 1
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  if (limitReached) {
    warn(`Directory limit of ${maxDirectories} reached, the scan stopped early.`)
  }

  projects.sort((a, b) => a.relPath.localeCompare(b.relPath))
  dirs.push(...[...records.values()].map((record) => record.entry))
  dirs.sort((a, b) => a.path.localeCompare(b.path))

  return { root, projects, dirs, warnings }
}
