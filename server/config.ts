import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

// Load `.env` from the project root (every entry point runs from there).
const envFile = path.resolve(process.cwd(), '.env')
const envFound = existsSync(envFile)
dotenv.config({ path: envFile, quiet: true })

/**
 * Application defaults.
 *
 * These are properties of the application itself (ports, file extensions, a
 * relative database path, the runtime modes), not values of a specific
 * installation. Anything that depends on the machine must be REQUIRED instead:
 * the process stops with an actionable message when it is missing.
 */
const DEFAULTS = {
  appMode: 'develop',
  apiMode: 'develop',
  apiHost: '127.0.0.1',
  apiPort: 4317,
  webPort: 5173,
  dbPath: './data/catalog.db',
  modelExtensions: ['.stl', '.3mf', '.obj', '.step', '.stp', '.sldprt'],
  ignoreDirs: ['node_modules', '.git', '.svn', '.idea', '.vscode'],
} as const

/** Runtime modes accepted by APP_MODE and API_MODE. */
export const RUNTIME_MODES = ['develop', 'staging', 'production'] as const
export type RuntimeMode = (typeof RUNTIME_MODES)[number]

/** Report a configuration problem and stop the process. */
function failConfiguration(message: string): never {
  console.error(`[config] ${message}`)
  console.error(
    envFound
      ? `[config] check ${envFile} (see .env.example)`
      : `[config] ${envFile} does not exist: copy .env.example to .env and fill it in`,
  )
  process.exit(1)
}

/** Read a mandatory variable, or stop with an actionable message. */
function requiredEnv(name: string, hint: string): string {
  const value = (process.env[name] ?? '').trim()
  if (value === '') {
    failConfiguration(`${name} is required but not set (${hint})`)
  }
  return value
}

/** Parse a comma separated environment list into a clean array. */
function toList(value: string | undefined, fallback: readonly string[]): string[] {
  if (value === undefined || value.trim() === '') return [...fallback]
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

/** Normalize extensions to lowercase, always prefixed with a dot. */
function toExtensions(value: string | undefined): string[] {
  const raw = toList(value, DEFAULTS.modelExtensions)
  const normalized = raw.map((ext) => {
    const lower = ext.toLowerCase()
    return lower.startsWith('.') ? lower : `.${lower}`
  })
  return [...new Set(normalized)]
}

/** Parse a port number, falling back when the value is not usable. */
function toPort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback
}

/** Parse a runtime mode and stop with an actionable message on a typo. */
function toMode(value: string | undefined, fallback: RuntimeMode, variable: string): RuntimeMode {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === '') return fallback
  if ((RUNTIME_MODES as readonly string[]).includes(normalized)) return normalized as RuntimeMode
  failConfiguration(`invalid ${variable}: "${value}" - allowed values are ${RUNTIME_MODES.join(' | ')}`)
}

/** Location of the model library. Mandatory: there is no built-in path. */
const modelsRoot = path.resolve(requiredEnv('MODELS_ROOT', 'absolute path of your 3D model library'))

const dbPath = path.resolve(process.env.DB_PATH?.trim() || DEFAULTS.dbPath)

/** Mode of the web app: decides how `npm run start:web` serves the UI. */
const appMode = toMode(process.env.APP_MODE, DEFAULTS.appMode, 'APP_MODE')

/** Mode of the API server: decides reload, logging and static serving. */
const apiMode = toMode(process.env.API_MODE, DEFAULTS.apiMode, 'API_MODE')

const apiHost = process.env.API_HOST?.trim() || DEFAULTS.apiHost
const apiPort = toPort(process.env.API_PORT, DEFAULTS.apiPort)
const webPort = toPort(process.env.WEB_PORT, DEFAULTS.webPort)

/** Effective runtime configuration shared by every entry point. */
export const config = {
  /** Absolute path of the folder tree that is catalogued. */
  modelsRoot,
  /** Absolute path of the SQLite database file. */
  dbPath,
  /** Runtime modes. */
  appMode,
  apiMode,
  /** True in every mode except `production`: extra logging. */
  verboseLogging: apiMode !== 'production',
  /** The API only serves the built UI outside of the Vite dev server mode. */
  serveStaticUi: appMode !== 'develop',
  apiHost,
  apiPort,
  webPort,
  /** Origins allowed to call the API from a browser. */
  allowedOrigins: toList(process.env.CORS_ORIGINS, [
    `http://localhost:${webPort}`,
    `http://127.0.0.1:${webPort}`,
  ]),
  /** Lowercase extensions (with dot) that identify a printable model. */
  modelExtensions: toExtensions(process.env.MODEL_EXTENSIONS),
  /** Folder names that the scanner must skip. */
  ignoreDirs: new Set(toList(process.env.IGNORE_DIRS, DEFAULTS.ignoreDirs).map((d) => d.toLowerCase())),
  /** Safety valve so a pathological tree cannot exhaust the heap. */
  maxDirectories: 300_000,
  /** Maximum number of per-folder errors reported by a single scan. */
  maxWarnings: 50,
} as const

/** URL the browser should open for the UI, depending on the app mode. */
export function webUrl(): string {
  return `http://localhost:${config.webPort}`
}

/** URL of the HTTP API. */
export function apiUrl(): string {
  return `http://${config.apiHost}:${config.apiPort}`
}

/** Human readable summary printed on server boot. */
export function describeConfig(): string {
  return [
    `app mode    : ${config.appMode}`,
    `api mode    : ${config.apiMode}`,
    `models root : ${config.modelsRoot}`,
    `database    : ${config.dbPath}`,
    `extensions  : ${config.modelExtensions.join(' ')}`,
    `web         : ${webUrl()} (${config.appMode === 'develop' ? 'vite dev server' : 'vite preview'})`,
    `api         : ${apiUrl()}`,
  ].join('\n')
}
