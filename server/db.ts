import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  CatalogStatus,
  ModelFile,
  Project,
  ProjectPage,
  ProjectQuery,
  ProjectSort,
  TreeDir,
  TreeResponse,
} from '../shared/types.ts'
import type { ScanOutput } from './scanner.ts'

/** Row shape of the `projects` table. */
interface ProjectRow {
  id: number
  category: string
  name: string
  rel_path: string
  abs_path: string
  depth: number
  model_count: number
  model_bytes: number
  created_at: number
  modified_at: number
  created_source: Project['createdSource']
}

/** Row shape of the `model_files` table. */
interface ModelRow {
  project_id: number
  name: string
  rel_path: string
  ext: string
  bytes: number
  modified_at: number
}

/** Row shape of the `dirs` table. */
interface DirRow {
  path: string
  name: string
  has_children: number
  project_count: number
}

/** Whitelisted ORDER BY expressions (never interpolate user input directly). */
const SORT_COLUMNS: Record<ProjectSort, string> = {
  name: 'p.name COLLATE NOCASE',
  category: 'p.category COLLATE NOCASE',
  createdAt: 'p.created_at',
  modifiedAt: 'p.modified_at',
  modelCount: 'p.model_count',
  modelBytes: 'p.model_bytes',
}

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 500

/**
 * Schema revision. The database is a regenerable cache of the filesystem, so a
 * version bump simply drops the tables and lets the next scan rebuild them.
 */
const SCHEMA_VERSION = 2

/** Escape LIKE wildcards so user text is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

/**
 * Local catalogue backed by SQLite.
 *
 * The scanner writes the whole tree into the database in one transaction and
 * the HTTP layer only ever reads from it, which keeps the UI responsive even
 * with thousands of folders.
 */
export class Catalog {
  readonly dbPath: string
  private readonly db: DatabaseSync

  constructor(dbPath: string) {
    this.dbPath = dbPath
    mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new DatabaseSync(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.migrate()
  }

  /** Create the schema, rebuilding it when the revision changed. */
  private migrate(): void {
    let currentVersion = 0
    try {
      const row = this.db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined
      currentVersion = row?.user_version ?? 0
    } catch {
      currentVersion = 0
    }

    if (currentVersion !== SCHEMA_VERSION) {
      this.db.exec(`
        DROP TABLE IF EXISTS model_files;
        DROP TABLE IF EXISTS projects;
        DROP TABLE IF EXISTS dirs;
        DROP TABLE IF EXISTS meta;
      `)
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id             INTEGER PRIMARY KEY,
        category       TEXT    NOT NULL,
        name           TEXT    NOT NULL,
        rel_path       TEXT    NOT NULL UNIQUE,
        abs_path       TEXT    NOT NULL,
        depth          INTEGER NOT NULL,
        model_count    INTEGER NOT NULL,
        model_bytes    INTEGER NOT NULL,
        created_at     INTEGER NOT NULL,
        modified_at    INTEGER NOT NULL,
        created_source TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS model_files (
        id          INTEGER PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name        TEXT    NOT NULL,
        rel_path    TEXT    NOT NULL,
        ext         TEXT    NOT NULL,
        bytes       INTEGER NOT NULL,
        modified_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dirs (
        path          TEXT PRIMARY KEY,
        -- NULL for the root folder, which therefore never matches a child lookup.
        parent        TEXT,
        name          TEXT NOT NULL,
        depth         INTEGER NOT NULL,
        has_children  INTEGER NOT NULL,
        project_count INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_projects_rel_path ON projects(rel_path);
      CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
      CREATE INDEX IF NOT EXISTS idx_model_files_project ON model_files(project_id);
      CREATE INDEX IF NOT EXISTS idx_dirs_parent ON dirs(parent);
    `)

    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  }

  /** Replace the whole catalogue with the result of a fresh scan. */
  replaceAll(scan: ScanOutput, durationMs: number): void {
    const insertProject = this.db.prepare(`
      INSERT INTO projects (
        category, name, rel_path, abs_path, depth, model_count, model_bytes,
        created_at, modified_at, created_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertModel = this.db.prepare(`
      INSERT INTO model_files (project_id, name, rel_path, ext, bytes, modified_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const insertDir = this.db.prepare(`
      INSERT INTO dirs (path, parent, name, depth, has_children, project_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const insertMeta = this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')

    this.db.exec('BEGIN')
    try {
      this.db.exec('DELETE FROM model_files')
      this.db.exec('DELETE FROM projects')
      this.db.exec('DELETE FROM dirs')

      for (const project of scan.projects) {
        const result = insertProject.run(
          project.category,
          project.name,
          project.relPath,
          project.absPath,
          project.depth,
          project.modelCount,
          project.modelBytes,
          project.createdAt,
          project.modifiedAt,
          project.createdSource,
        )
        const projectId = Number(result.lastInsertRowid)
        for (const model of project.models) {
          insertModel.run(projectId, model.name, model.relPath, model.ext, model.bytes, model.modifiedAt)
        }
      }

      for (const dir of scan.dirs) {
        insertDir.run(dir.path, dir.parent, dir.name, dir.depth, dir.hasChildren ? 1 : 0, dir.projectCount)
      }

      insertMeta.run('root', scan.root)
      insertMeta.run('scanned_at', String(Date.now()))
      insertMeta.run('scan_duration_ms', String(Math.round(durationMs)))

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  /** Read a value from the `meta` table. */
  private readMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  /** Store a value in the `meta` table. */
  writeMeta(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value)
  }

  /** Counters and timestamps shown in the UI header. */
  status(modelsRoot: string, modelExtensions: string[]): CatalogStatus {
    const one = (sql: string): number => {
      const row = this.db.prepare(sql).get() as { total: number } | undefined
      return row?.total ?? 0
    }

    const scannedAt = this.readMeta('scanned_at')
    const duration = this.readMeta('scan_duration_ms')

    return {
      modelsRoot,
      rootExists: false,
      dbPath: this.dbPath,
      projects: one('SELECT COUNT(*) AS total FROM projects'),
      models: one('SELECT COUNT(*) AS total FROM model_files'),
      dirs: one('SELECT COUNT(*) AS total FROM dirs'),
      categories: one('SELECT COUNT(DISTINCT category) AS total FROM projects'),
      lastScanAt: scannedAt ? Number(scannedAt) : null,
      lastScanDurationMs: duration ? Number(duration) : null,
      scanning: false,
      modelExtensions,
      lastError: null,
    }
  }

  /**
   * All categories with their project count.
   *
   * Data layer helper, deliberately not exposed over HTTP: the UI reads the
   * categories from the first level of the tree. It exists to associate
   * catalogue items quickly (grouping, filters, reports) without walking the
   * folder tree.
   */
  categories(): Array<{ category: string; projects: number }> {
    const rows = this.db
      .prepare('SELECT category, COUNT(*) AS projects FROM projects GROUP BY category ORDER BY category COLLATE NOCASE')
      .all() as unknown as Array<{ category: string; projects: number }>
    return rows
  }

  /** Children of one folder plus the counters needed by the tree widget. */
  tree(scope: string): TreeResponse | null {
    const node = this.db
      .prepare('SELECT path, name, has_children, project_count FROM dirs WHERE path = ?')
      .get(scope) as unknown as DirRow | undefined

    if (!node) return null

    const children = this.db
      .prepare(
        `SELECT path, name, has_children, project_count
         FROM dirs WHERE parent = ? ORDER BY name COLLATE NOCASE`,
      )
      .all(scope) as unknown as DirRow[]

    const isProject =
      this.db.prepare('SELECT 1 AS found FROM projects WHERE rel_path = ?').get(scope) !== undefined

    return {
      path: node.path,
      name: node.name,
      projectCount: node.project_count,
      isProject,
      children: children.map<TreeDir>((child) => ({
        name: child.name,
        path: child.path,
        hasChildren: child.has_children === 1,
        projectCount: child.project_count,
      })),
    }
  }

  /** Paginated, filtered and sorted project listing. */
  projects(query: ProjectQuery): ProjectPage {
    const scope = (query.scope ?? '').replace(/^\/+|\/+$/g, '')
    const search = (query.q ?? '').trim()
    const sort: ProjectSort = query.sort && query.sort in SORT_COLUMNS ? query.sort : 'name'
    const direction = query.dir === 'desc' ? 'DESC' : 'ASC'
    const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

    const where: string[] = []
    const params: Array<string | number> = []

    if (scope !== '') {
      where.push(`(p.rel_path = ? OR p.rel_path LIKE ? ESCAPE '\\')`)
      params.push(scope, `${escapeLike(scope)}/%`)
    }

    if (search !== '') {
      const like = `%${escapeLike(search)}%`
      where.push(
        `(p.name LIKE ? ESCAPE '\\' OR p.category LIKE ? ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM model_files m WHERE m.project_id = p.id AND m.name LIKE ? ESCAPE '\\'))`,
      )
      params.push(like, like, like)
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM projects p ${whereSql}`)
      .get(...params) as { total: number } | undefined
    const total = countRow?.total ?? 0

    const pageCount = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(Math.max(query.page ?? 1, 1), pageCount)
    const offset = (page - 1) * pageSize

    const rows = this.db
      .prepare(
        `SELECT p.id, p.category, p.name, p.rel_path, p.abs_path, p.depth,
                p.model_count, p.model_bytes, p.created_at, p.modified_at, p.created_source
         FROM projects p
         ${whereSql}
         ORDER BY ${SORT_COLUMNS[sort]} ${direction}, p.name COLLATE NOCASE ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as unknown as ProjectRow[]

    const modelsByProject = this.loadModels(rows.map((row) => row.id))

    return {
      total,
      page,
      pageSize,
      pageCount,
      items: rows.map<Project>((row) => ({
        id: row.id,
        category: row.category,
        name: row.name,
        relPath: row.rel_path,
        absPath: row.abs_path,
        depth: row.depth,
        modelCount: row.model_count,
        modelBytes: row.model_bytes,
        createdAt: row.created_at,
        modifiedAt: row.modified_at,
        createdSource: row.created_source,
        models: modelsByProject.get(row.id) ?? [],
      })),
    }
  }

  /** Fetch the model files of the given projects, grouped by project id. */
  private loadModels(projectIds: number[]): Map<number, ModelFile[]> {
    const grouped = new Map<number, ModelFile[]>()
    if (projectIds.length === 0) return grouped

    const placeholders = projectIds.map(() => '?').join(', ')
    const rows = this.db
      .prepare(
        `SELECT project_id, name, rel_path, ext, bytes, modified_at
         FROM model_files WHERE project_id IN (${placeholders})
         ORDER BY name COLLATE NOCASE`,
      )
      .all(...projectIds) as unknown as ModelRow[]

    for (const row of rows) {
      const list = grouped.get(row.project_id) ?? []
      list.push({
        name: row.name,
        relPath: row.rel_path,
        ext: row.ext,
        bytes: row.bytes,
        modifiedAt: row.modified_at,
      })
      grouped.set(row.project_id, list)
    }

    return grouped
  }

  /** Folder of a project, used to validate reveal requests. */
  projectPath(projectId: number): { relPath: string; absPath: string } | null {
    const row = this.db
      .prepare('SELECT rel_path, abs_path FROM projects WHERE id = ?')
      .get(projectId) as { rel_path: string; abs_path: string } | undefined
    return row ? { relPath: row.rel_path, absPath: row.abs_path } : null
  }

  close(): void {
    this.db.close()
  }
}
