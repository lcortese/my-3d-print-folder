import http from 'node:http'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { apiUrl } from '../server/config.ts'

/**
 * Child process that runs the API and serves the built UI.
 *
 * `electron/main.ts` starts it on Electron's own Node runtime
 * (`ELECTRON_RUN_AS_NODE`), so the backend is exactly the one `npm run
 * start:api` runs. This file adds nothing to it: it only reports the URL the
 * API ended up listening on, because the shell needs it to open the window.
 */

/** How long to wait for the API to answer before reporting a failure. */
const READY_TIMEOUT_MS = 30_000

/** True when `GET /api/status` answers. */
function responds(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(`${url}/api/status`, (response) => {
      response.resume()
      resolve(response.statusCode === 200)
    })
    request.on('error', () => resolve(false))
    request.setTimeout(1000, () => {
      request.destroy()
      resolve(false)
    })
  })
}

/** Poll the API until it answers, so the window never opens on nothing. */
async function waitUntilListening(url: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (!(await responds(url))) {
    if (Date.now() > deadline) {
      throw new Error(`the API did not answer on ${url} within ${READY_TIMEOUT_MS} ms`)
    }
    await delay(150)
  }
}

// Started by the desktop shell: when the shell goes away the IPC channel closes,
// and this process must not stay behind holding the port.
process.on('disconnect', () => process.exit(0))

// Importing the server entry point starts it, exactly like `npm run
// start:api`: it listens immediately and scans only when there is no
// catalogue yet.
await import('../server/index.ts')

try {
  await waitUntilListening(apiUrl())
} catch (error) {
  console.error(`[desktop] ${(error as Error).message}`)
  process.exit(1)
}

// The shell waits for this message to know which URL to open.
process.send?.({ type: 'listening', url: apiUrl() })
