import { fork, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { app, BrowserWindow, dialog, shell } from 'electron'

/**
 * Desktop shell for the catalogue.
 *
 * It adds no application logic: it starts the existing API (the same entry
 * point `npm run start:api` uses) as a child process and shows the built UI
 * in a window. The child runs Electron's own Node runtime, so `node:sqlite` and
 * the rest of the backend work exactly as they do from the command line.
 */

/**
 * Compiled application folder, which holds `dist/`, `dist-electron/` and
 * `node_modules`. This file lives in `dist-electron/electron/`.
 */
const appRoot = path.resolve(import.meta.dirname, '..', '..')

/**
 * Folder the user sees: the `.env` file lives next to the executable. In
 * development the executable is the Electron binary inside `node_modules`, so
 * the project root is used instead and `.env` keeps working as usual.
 */
const exeDir = app.isPackaged ? path.dirname(app.getPath('exe')) : appRoot

/** Entry point of the child process that runs the API and serves the UI. */
const serverEntry = path.join(appRoot, 'dist-electron', 'electron', 'server-process.js')

/** How long the shell waits for the API to announce itself before giving up. */
const BOOT_TIMEOUT_MS = 60_000

/** Bytes of child output kept for the error dialog when the API cannot start. */
const DIAGNOSTICS_LIMIT = 8192

// The desktop app is configured through the `.env` next to its executable. The
// child process inherits these values, and `server/config.ts` finds them
// already set, so its own lookup stays a no-op.
dotenv.config({ path: path.join(exeDir, '.env'), quiet: true })

// `develop` hands the UI to the Vite dev server, which does not exist in a
// packaged app: the shell always serves the built bundle from disk. Any other
// value is left alone, so an invalid mode is still reported by the API.
const requestedMode = (process.env.APP_MODE ?? '').trim().toLowerCase()
if (requestedMode === '' || requestedMode === 'develop') {
  process.env.APP_MODE = 'production'
}

/** Child process running the API, kept around to stop it when the app quits. */
let serverProcess: ChildProcess | null = null

/** Start the API and resolve with the URL it announced once it is listening. */
function startServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = fork(serverEntry, [], {
      // The child is the only process that resolves paths from the working
      // directory: `dist/`, `.env` and the database all hang off the app root.
      cwd: appRoot,
      // Run the Electron binary as a plain Node process.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    serverProcess = child

    /** Last part of the child's stderr, shown when it fails to start. */
    let diagnostics = ''
    let settled = false

    const settle = (error: Error | null, url?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolve(url ?? '')
    }

    const timeout = setTimeout(() => {
      settle(new Error(`the API did not start within ${BOOT_TIMEOUT_MS} ms\n\n${diagnostics}`))
    }, BOOT_TIMEOUT_MS)

    child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk))
    child.stderr?.on('data', (chunk: Buffer) => {
      diagnostics = (diagnostics + chunk.toString()).slice(-DIAGNOSTICS_LIMIT)
      process.stderr.write(chunk)
    })

    child.on('message', (message: unknown) => {
      const payload = message as { type?: string; url?: string } | null
      if (payload?.type === 'listening' && typeof payload.url === 'string') {
        settle(null, payload.url)
      }
    })

    child.on('error', (error: Error) => {
      settle(new Error(`could not start the API process: ${error.message}\n\n${diagnostics}`))
    })

    child.on('exit', (code) => {
      serverProcess = null
      settle(new Error(`the API process stopped with code ${code}\n\n${diagnostics}`))
    })
  })
}

/** Open the application window on the local URL the API is serving. */
function createWindow(url: string): void {
  const appOrigin = new URL(url).origin

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: '3D Print Catalog',
    // The default menu stays available behind Alt, but takes no space.
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })

  // The window only ever shows the local app: every other destination is handed
  // to the operating system browser.
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== appOrigin) {
      event.preventDefault()
      void shell.openExternal(target)
    }
  })

  window.loadURL(url).catch((error: unknown) => {
    dialog.showErrorBox('3D Print Catalog', `Could not open ${url}.\n\n${(error as Error).message}`)
    app.quit()
  })
}

/** Wait for Electron, boot the API and show the window. */
async function main(): Promise<void> {
  await app.whenReady()

  const url = await startServer()
  createWindow(url)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url)
  })
}

// A second launch focuses the running window instead of starting a second API.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows()
    if (!existing) return
    if (existing.isMinimized()) existing.restore()
    existing.focus()
  })

  // Closing the window ends the app, and with it the API child process.
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => serverProcess?.kill())

  main().catch((error: unknown) => {
    dialog.showErrorBox('3D Print Catalog', `The application could not start.\n\n${(error as Error).message}`)
    app.quit()
  })
}
