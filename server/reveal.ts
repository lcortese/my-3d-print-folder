import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

export interface RevealResult {
  ok: boolean
  command: string
  target: string
  error?: string
}

/** Detect a WSL (Windows Subsystem for Linux) environment. */
export function isWsl(): boolean {
  if (process.platform !== 'linux') return false
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true
  try {
    return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

/**
 * Translate a WSL mount path into a Windows path.
 * `/mnt/d/models` -> `D:\models`
 */
export function toWindowsPath(target: string): string | null {
  const match = /^\/mnt\/([a-zA-Z])\/(.*)$/.exec(target)
  if (!match) return null
  return `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, '\\')}`
}

/** Path of the Windows explorer executable, if it can be found. */
function windowsExplorer(): string {
  const candidates = ['/mnt/c/Windows/explorer.exe', '/mnt/c/Windows/System32/explorer.exe']
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return 'explorer.exe'
}

/**
 * Arguments for `explorer.exe`.
 *
 * The switch and the path MUST be two separate arguments. Passed as a single
 * token, a path containing spaces makes the Windows command line quote the
 * whole thing (`"/select,D:\my models\file.stl"`): explorer does not recognise
 * the switch and opens its default folder instead of the requested one.
 */
function explorerArgs(target: string, selectFile: boolean): string[] {
  return selectFile ? ['/select,', target] : [target]
}

/** Short description of what `revealInFileManager` will use on this machine. */
export function describeRevealStrategy(): string {
  if (isWsl()) return `WSL -> ${windowsExplorer()}`
  if (process.platform === 'win32') return 'explorer.exe'
  if (process.platform === 'darwin') return 'open'
  return 'xdg-open'
}

/**
 * Open the operating system file manager on a folder, optionally selecting a
 * specific file inside it.
 *
 * The process is spawned detached and never awaited: `explorer.exe` returns
 * exit code 1 even on success, so exit codes are intentionally ignored.
 */
export function revealInFileManager(target: string, selectFile = false): RevealResult {
  let command: string
  let args: string[]

  if (isWsl()) {
    const windowsTarget = toWindowsPath(target)
    if (!windowsTarget) {
      return { ok: false, command: 'explorer.exe', target, error: `Not a WSL mount path: ${target}` }
    }
    command = windowsExplorer()
    args = explorerArgs(windowsTarget, selectFile)
  } else if (process.platform === 'win32') {
    command = 'explorer.exe'
    args = explorerArgs(target, selectFile)
  } else if (process.platform === 'darwin') {
    command = 'open'
    args = selectFile ? ['-R', target] : [target]
  } else {
    // Plain Linux file managers cannot select a file: open the parent folder.
    command = 'xdg-open'
    const dir = selectFile ? target.slice(0, target.lastIndexOf('/')) || '/' : target
    args = [dir]
  }

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.on('error', (error) => {
      console.error(`[reveal] failed to launch ${command}: ${error.message}`)
    })
    child.unref()
    return { ok: true, command, target }
  } catch (error) {
    return { ok: false, command, target, error: (error as Error).message }
  }
}
