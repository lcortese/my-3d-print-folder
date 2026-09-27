/**
 * Starts the web app according to APP_MODE.
 *
 *   develop             -> Vite dev server (no build, hot reload)
 *   staging, production -> Vite preview of `dist/` (built once when missing)
 *
 * Both variants listen on WEB_PORT and proxy `/api` to the API server, so the
 * browser only ever talks to one origin.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { config, webUrl } from '../server/config.ts'
import { localBin, runForeground, runOnce } from './lib/run.ts'

const vite = localBin('vite')
const distIndex = path.resolve(process.cwd(), 'dist', 'index.html')

async function main(): Promise<void> {
  if (config.appMode === 'develop') {
    console.log(`[web] APP_MODE=develop: vite dev server on ${webUrl()} (hot reload, no build)`)
    console.log(`[web] /api is proxied to ${config.apiHost}:${config.apiPort}`)
    await runForeground(vite, ['--port', String(config.webPort), '--strictPort'])
    return
  }

  if (!existsSync(distIndex)) {
    console.log('[web] dist/index.html is missing: running "vite build" once before serving it')
    const build = await runOnce(vite, ['build'])
    if (build.code !== 0) {
      console.error(`[web] vite build failed with exit code ${build.code}`)
      process.exitCode = build.code
      return
    }
  }

  console.log(`[web] APP_MODE=${config.appMode}: vite preview of dist/ on ${webUrl()}`)
  await runForeground(vite, ['preview', '--port', String(config.webPort), '--strictPort'])
}

void main().catch((error: unknown) => {
  console.error(`[web] ${(error as Error).message}`)
  process.exitCode = 1
})
