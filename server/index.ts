import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import express from 'express'
import type { Request, Response } from 'express'
import type { CatalogStatus, ProjectQuery, ProjectSort, ScanStarted, ScanSummary, SortDirection } from '../shared/types.ts'
import { config, apiUrl, describeConfig, webUrl } from './config.ts'
import { Catalog } from './db.ts'
import { describeRevealStrategy, revealInFileManager } from './reveal.ts'
import { scanModelsRoot } from './scanner.ts'

const catalog = new Catalog(config.dbPath)
const distDir = path.resolve(process.cwd(), 'dist')

/** Scan state shared with the UI through `GET /api/status`. */
const scanState: { running: boolean; lastError: string | null } = { running: false, lastError: null }
let scanInFlight: Promise<ScanSummary> | null = null

/** True when the absolute path lives inside MODELS_ROOT. */
function isInsideRoot(target: string): boolean {
  const relative = path.relative(config.modelsRoot, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** Resolve a path relative to MODELS_ROOT, rejecting escapes. */
function resolveInsideRoot(relativePath: string): string | null {
  const absolute = path.resolve(config.modelsRoot, relativePath)
  return isInsideRoot(absolute) ? absolute : null
}

/** Run a full scan and swap the catalogue contents atomically. */
async function runScan(): Promise<ScanSummary> {
  if (scanInFlight) return scanInFlight

  scanInFlight = (async (): Promise<ScanSummary> => {
    scanState.running = true
    scanState.lastError = null
    const startedAt = Date.now()

    try {
      const output = await scanModelsRoot({
        root: config.modelsRoot,
        modelExtensions: config.modelExtensions,
        ignoreDirs: config.ignoreDirs,
        maxDirectories: config.maxDirectories,
        maxWarnings: config.maxWarnings,
      })
      const durationMs = Date.now() - startedAt

      catalog.replaceAll(output, durationMs)

      if (output.warnings.length > 0) {
        if (config.verboseLogging) {
          for (const warning of output.warnings) console.warn(`[scan] warning: ${warning}`)
        } else {
          console.warn(`[scan] ${output.warnings.length} warning(s)`)
        }
      }

      return {
        projects: output.projects.length,
        models: output.projects.reduce((total, project) => total + project.models.length, 0),
        dirs: output.dirs.length,
        durationMs,
        scannedAt: Date.now(),
        warnings: output.warnings,
      }
    } catch (error) {
      scanState.lastError = (error as Error).message
      throw error
    } finally {
      scanState.running = false
      scanInFlight = null
    }
  })()

  return scanInFlight
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '64kb' }))

// The web app may run on a different port (Vite dev server or preview), so the
// API answers CORS preflight requests for the configured origins.
app.use((req: Request, res: Response, next) => {
  const origin = req.headers.origin
  if (typeof origin === 'string' && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

/** Current catalogue counters merged with the live scan state. */
app.get('/api/status', (_req: Request, res: Response) => {
  const status: CatalogStatus = {
    ...catalog.status(config.modelsRoot, [...config.modelExtensions]),
    rootExists: existsSync(config.modelsRoot),
    scanning: scanState.running,
    lastError: scanState.lastError,
  }
  res.json(status)
})

/** Children of one folder of the navigable tree. */
app.get('/api/tree', (req: Request, res: Response) => {
  const scope = typeof req.query.path === 'string' ? req.query.path.replace(/^\/+|\/+$/g, '') : ''
  const node = catalog.tree(scope)
  if (!node) {
    res.status(404).json({ error: `Folder "${scope}" is not part of the catalogue. Run a scan first.` })
    return
  }
  res.json(node)
})

/** Paginated project listing with free text filtering. */
app.get('/api/projects', (req: Request, res: Response) => {
  const toNumber = (value: unknown, fallback: number): number => {
    const parsed = Number.parseInt(String(value ?? ''), 10)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const query: ProjectQuery = {
    scope: typeof req.query.scope === 'string' ? req.query.scope : '',
    q: typeof req.query.q === 'string' ? req.query.q : '',
    sort: (typeof req.query.sort === 'string' ? req.query.sort : 'name') as ProjectSort,
    dir: (req.query.dir === 'desc' ? 'desc' : 'asc') as SortDirection,
    page: toNumber(req.query.page, 1),
    pageSize: toNumber(req.query.pageSize, 50),
  }

  res.json(catalog.projects(query))
})

/** Start a background rescan. Poll `GET /api/status` until `scanning` is false. */
app.post('/api/scan', (_req: Request, res: Response) => {
  if (scanState.running) {
    const payload: ScanStarted = { started: false, alreadyRunning: true }
    res.status(202).json(payload)
    return
  }

  void runScan().catch((error: unknown) => {
    console.error(`[scan] failed: ${(error as Error).message}`)
  })

  const payload: ScanStarted = { started: true }
  res.status(202).json(payload)
})

/** Open the OS file manager on a project folder (or select one of its files). */
app.post('/api/reveal', (req: Request, res: Response) => {
  const body = req.body as { projectId?: number; relPath?: string; selectFile?: boolean } | undefined
  const selectFile = body?.selectFile === true

  let target: string | null = null

  if (typeof body?.projectId === 'number') {
    const project = catalog.projectPath(body.projectId)
    if (!project) {
      res.status(404).json({ error: `Unknown project id ${body.projectId}` })
      return
    }
    target = project.absPath

    if (selectFile && typeof body.relPath === 'string') {
      const candidate = resolveInsideRoot(body.relPath)
      if (!candidate || !isInsideRoot(candidate) || !candidate.startsWith(project.absPath)) {
        res.status(400).json({ error: 'The requested file is not part of that project.' })
        return
      }
      target = candidate
    }
  } else if (typeof body?.relPath === 'string') {
    target = resolveInsideRoot(body.relPath)
  }

  if (!target) {
    res.status(400).json({ error: 'Provide a valid projectId or a relPath inside MODELS_ROOT.' })
    return
  }

  if (!existsSync(target)) {
    res.status(404).json({ error: `Path no longer exists on disk: ${target}` })
    return
  }

  const result = revealInFileManager(target, selectFile)
  if (!result.ok) {
    res.status(500).json({ error: result.error ?? 'Could not open the file manager' })
    return
  }

  res.json({ ok: true, target: result.target, command: result.command })
})

// ---------------------------------------------------------------------------
// Static frontend.
//
// In `develop` the UI is served by the Vite dev server and this process only
// answers the API. In `staging` and `production` the built bundle is served
// here as well, so a single process can expose the app and the API together.
// The bundle is looked up per request, so a build finished after the boot is
// picked up without restarting the server.
// ---------------------------------------------------------------------------

const distIndex = path.join(distDir, 'index.html')
const serveAssets = express.static(distDir, { index: false })

app.use((req: Request, res: Response, next) => {
  if (
    !config.serveStaticUi ||
    // Never let the SPA fallback swallow an unknown API route.
    req.path.startsWith('/api') ||
    (req.method !== 'GET' && req.method !== 'HEAD') ||
    !existsSync(distIndex)
  ) {
    next()
    return
  }
  // Serve the matching asset, otherwise hand the SPA entry point to the router.
  serveAssets(req, res, () => {
    res.sendFile(distIndex)
  })
})

/** Friendly answer for everything that did not match a route above. */
app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: `Unknown endpoint ${req.method} ${req.path}` })
    return
  }

  if (!config.serveStaticUi) {
    res
      .status(200)
      .type('text/plain')
      .send(`APP_MODE=develop: the UI is served by the Vite dev server on ${webUrl()}. This port only answers the API.`)
    return
  }

  res
    .status(503)
    .type('text/plain')
    .send('The UI bundle is missing. Run "npm run build", or start the web app with "npm run start:web".')
})

/**
 * Boot: listen immediately, then use the existing catalogue.
 *
 * A scan only runs when the database has never been built (or was rebuilt after
 * a schema change): an existing catalogue is used as is, and the UI refreshes it
 * on demand with the "Rescan" button.
 */
async function bootstrap(): Promise<void> {
  console.log('3D print catalogue server')
  console.log(describeConfig())
  if (config.verboseLogging) {
    console.log(`reveal      : ${describeRevealStrategy()}`)
  }

  const distReady = existsSync(path.join(distDir, 'index.html'))
  const catalogue = catalog.status(config.modelsRoot, [...config.modelExtensions])

  app.listen(config.apiPort, config.apiHost, () => {
    console.log(`[http] api    ${apiUrl()}/api/status`)
    if (config.serveStaticUi) {
      const suffix = distReady ? '' : ' (dist/ not built yet: run "npm run build")'
      console.log(`[http] app    ${apiUrl()}${suffix}`)
    } else {
      console.log(`[http] app    ${webUrl()} (vite dev server)`)
    }
  })

  if (catalogue.lastScanAt !== null) {
    console.log(
      `[scan] using the existing catalogue: ${catalogue.projects} projects, ${catalogue.models} models ` +
        `(database scanned ${new Date(catalogue.lastScanAt).toISOString()})`,
    )
    console.log('[scan] rescan it from the UI ("Rescan") or with "npm run scan"')
    return
  }

  // The API answers right away and reports `scanning: true` in the meantime.
  console.log('[scan] no catalogue yet: running the first scan ...')
  try {
    const summary = await runScan()
    console.log(
      `[scan] done: ${summary.projects} projects, ${summary.models} models, ` +
        `${summary.dirs} folders in ${summary.durationMs} ms`,
    )
  } catch (error) {
    console.error(`[scan] failed: ${(error as Error).message}`)
    console.error('[scan] the UI stays empty until a scan succeeds')
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n[http] ${signal} received, shutting down`)
    catalog.close()
    process.exit(0)
  })
}

void bootstrap()
