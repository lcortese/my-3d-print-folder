/**
 * Starts the API server according to API_MODE.
 *
 *   develop             -> tsx watch, reloads on every change
 *   staging, production -> tsx, no reload
 *
 * The API always listens on API_HOST:API_PORT. Outside of `develop` it also
 * serves the built UI, so a single service can expose app and API together.
 */
import process from 'node:process'
import { apiUrl, config } from '../server/config.ts'
import { localBin, runForeground } from './lib/run.ts'

const tsx = localBin('tsx')
const entry = 'server/index.ts'

async function main(): Promise<void> {
  if (config.apiMode === 'develop') {
    console.log(`[server] API_MODE=develop: tsx watch, reload on change | ${apiUrl()}`)
    // The project lives on a Windows drive mounted through 9p: inotify events do
    // not cross that boundary, so the watcher has to poll for changes.
    await runForeground(tsx, ['watch', entry], { CHOKIDAR_USEPOLLING: '1', CHOKIDAR_INTERVAL: '300' })
    return
  }

  console.log(`[server] API_MODE=${config.apiMode}: tsx, no reload | ${apiUrl()}`)
  await runForeground(tsx, [entry])
}

void main().catch((error: unknown) => {
  console.error(`[server] ${(error as Error).message}`)
  process.exitCode = 1
})
