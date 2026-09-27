/**
 * Starts the app and the API together (`npm start`).
 *
 * Both launchers are children of this process and inherit this terminal, which
 * is exactly how `start:app` and `start:api` run when they are started on their
 * own.
 *
 * `concurrently` is deliberately not used here. On Windows it hands its
 * children a piped stdin, and `tsx watch` (the API in `develop`) hangs on that
 * combination before it runs the script (privatenumber/tsx#623): the API never
 * listened, so every `/api` request answered 502 through the Vite proxy.
 *
 * The two are also stopped together: as soon as one of them exits, the other is
 * asked to stop, so `npm start` never leaves half of the application running
 * with a port of its own.
 */
import process from 'node:process'
import type { RunResult } from './lib/run.ts'
import { localBin, spawnForeground } from './lib/run.ts'

const tsx = localBin('tsx')

/** Entry points of the two halves of `npm start`, in the order they start. */
const LAUNCHERS = ['scripts/start-web.ts', 'scripts/start-server.ts'] as const

async function main(): Promise<void> {
  const children = LAUNCHERS.map((entry) => spawnForeground(tsx, [entry]))

  let stopping = false
  const stopAll = (signal: NodeJS.Signals): void => {
    if (stopping) return
    stopping = true
    for (const child of children) child.signal(signal)
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => stopAll(signal))
  }

  const results = await Promise.all(
    children.map(async (child): Promise<RunResult> => {
      try {
        return await child.closed
      } catch (error) {
        console.error(`[start] ${(error as Error).message}`)
        return { code: 1, signal: null }
      } finally {
        // One half is enough: the other one has nothing left to serve.
        stopAll('SIGTERM')
      }
    }),
  )

  // The first failure decides the status of `npm start`.
  process.exitCode = results.find((result) => result.code !== 0)?.code ?? 0
}

void main().catch((error: unknown) => {
  console.error(`[start] ${(error as Error).message}`)
  process.exitCode = 1
})
