import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

/** Absolute path of a binary installed in `node_modules/.bin`. */
export function localBin(name: string): string {
  const extension = process.platform === 'win32' ? '.cmd' : ''
  return path.join(process.cwd(), 'node_modules', '.bin', `${name}${extension}`)
}

/** Windows needs a shell to execute the `.cmd` shims of npm packages. */
function spawnOptions(env?: NodeJS.ProcessEnv): { stdio: 'inherit'; shell: boolean; env: NodeJS.ProcessEnv } {
  return {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: env ? { ...process.env, ...env } : process.env,
  }
}

export interface RunResult {
  code: number
  signal: NodeJS.Signals | null
}

/** Run a command to completion and resolve with its exit status. */
export function runOnce(command: string, args: string[]): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, args, spawnOptions())
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve({ code: code ?? 0, signal }))
  })
}

/**
 * Run a long lived process in the foreground.
 *
 * Terminal signals are forwarded to the child so `Ctrl+C` stops it cleanly and
 * the launcher itself never exits with a different status than its child.
 */
export function runForeground(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, spawnOptions(env))

    const forward = (signal: NodeJS.Signals) => (): void => {
      if (!child.killed) child.kill(signal)
    }
    const onInterrupt = forward('SIGINT')
    const onTerminate = forward('SIGTERM')
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
      process.exitCode = code ?? (signal ? 1 : 0)
      resolve()
    })
  })
}
