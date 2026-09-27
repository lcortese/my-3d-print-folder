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

/** A long lived process that runs with this terminal inherited. */
export interface ForegroundProcess {
  /** Settles with the exit status once the process is gone. */
  closed: Promise<RunResult>
  /** Forward a signal to the process, when it is still running. */
  signal(signal: NodeJS.Signals): void
}

/**
 * Start a long lived process in the foreground.
 *
 * The process inherits this terminal's stdio, so it reads the same stdin and
 * writes to the same console it would have if it had been started on its own.
 * That matters on Windows: a piped stdin hangs `tsx watch` before it runs the
 * script (privatenumber/tsx#623).
 */
export function spawnForeground(command: string, args: string[], env?: NodeJS.ProcessEnv): ForegroundProcess {
  const child = spawn(command, args, spawnOptions(env))

  const closed = new Promise<RunResult>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve({ code: code ?? (signal ? 1 : 0), signal }))
  })

  return {
    closed,
    signal: (signal) => {
      if (!child.killed) child.kill(signal)
    },
  }
}

/**
 * Run a long lived process in the foreground.
 *
 * Terminal signals are forwarded to the child so `Ctrl+C` stops it cleanly and
 * the launcher itself never exits with a different status than its child.
 */
export async function runForeground(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  const child = spawnForeground(command, args, env)

  const forward = (signal: NodeJS.Signals) => (): void => child.signal(signal)
  const onInterrupt = forward('SIGINT')
  const onTerminate = forward('SIGTERM')
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)

  try {
    process.exitCode = (await child.closed).code
  } finally {
    process.off('SIGINT', onInterrupt)
    process.off('SIGTERM', onTerminate)
  }
}
