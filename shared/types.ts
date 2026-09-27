/**
 * Shared API contract between the scanner/backend and the React frontend.
 * Keep this file dependency free: it is imported by both runtimes.
 */

/** Timestamp source used for the "created at" column on this filesystem. */
export type CreatedSource = 'birthtime' | 'ctime' | 'mtime'

/** A single 3D model file that belongs to a project folder. */
export interface ModelFile {
  /** File name including extension. */
  name: string
  /** Path relative to MODELS_ROOT, using forward slashes. */
  relPath: string
  /** Lowercase extension including the dot, e.g. ".stl". */
  ext: string
  /** File size in bytes. */
  bytes: number
  /** Last modification time (epoch milliseconds). */
  modifiedAt: number
}

/** A folder that directly contains at least one model file. */
export interface Project {
  id: number
  /** First level folder under MODELS_ROOT. */
  category: string
  /** Folder name of the project. */
  name: string
  /** Path relative to MODELS_ROOT, using forward slashes. */
  relPath: string
  /** Absolute path on disk. */
  absPath: string
  /** Nesting level under MODELS_ROOT (1 = directly inside a category). */
  depth: number
  modelCount: number
  modelBytes: number
  /** Folder creation time (epoch milliseconds). */
  createdAt: number
  /** Newest modification time of the folder and its direct entries. */
  modifiedAt: number
  createdSource: CreatedSource
  /** Model files of the project, sorted by name. */
  models: ModelFile[]
}

/** Sortable columns of the project table. */
export type ProjectSort = 'name' | 'category' | 'createdAt' | 'modifiedAt' | 'modelCount' | 'modelBytes'

export type SortDirection = 'asc' | 'desc'

/** Query accepted by `GET /api/projects`. */
export interface ProjectQuery {
  /** Folder scope: only projects at or below this relative path are returned. */
  scope?: string
  /** Free text filter applied to name, category and model file names. */
  q?: string
  sort?: ProjectSort
  dir?: SortDirection
  page?: number
  pageSize?: number
}

/** Paginated response of `GET /api/projects`. */
export interface ProjectPage {
  total: number
  page: number
  pageSize: number
  pageCount: number
  items: Project[]
}

/** One child folder of the navigable tree. */
export interface TreeDir {
  name: string
  /** Path relative to MODELS_ROOT ("" is the root itself). */
  path: string
  hasChildren: boolean
  /** Projects contained in this folder and all of its subfolders. */
  projectCount: number
}

/** Response of `GET /api/tree`. */
export interface TreeResponse {
  path: string
  name: string
  projectCount: number
  children: TreeDir[]
  /** True when the scope folder itself contains model files. */
  isProject: boolean
}

/** Response of `GET /api/status`. */
export interface CatalogStatus {
  modelsRoot: string
  rootExists: boolean
  dbPath: string
  projects: number
  models: number
  dirs: number
  categories: number
  lastScanAt: number | null
  lastScanDurationMs: number | null
  scanning: boolean
  modelExtensions: string[]
  /** Message of the last scan failure, if any. */
  lastError: string | null
}

/** Response of `POST /api/scan`. */
export interface ScanSummary {
  projects: number
  models: number
  dirs: number
  durationMs: number
  scannedAt: number
  warnings: string[]
}

/** Accepted response of `POST /api/scan` (the scan runs in the background). */
export interface ScanStarted {
  started: boolean
  alreadyRunning?: boolean
}

/** Uniform error payload. */
export interface ApiError {
  error: string
}
