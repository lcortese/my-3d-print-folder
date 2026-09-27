import { createContext } from 'react'
import type { CatalogStatus } from '../../shared/types.ts'

/** Catalogue status shared by the app shell and every module. */
export interface StatusContextValue {
  /** Undefined until the API answers. */
  status?: CatalogStatus
  loading: boolean
  error?: string
  /** True while a scan is running on the server. */
  scanning: boolean
  /** True between the rescan request and its acknowledgement. */
  rescanPending: boolean
  /** Start a scan; the page reloads by itself once it finishes. */
  rescan: () => void
}

/** Null on purpose: it is how a consumer detects that the provider is missing. */
export const StatusContext = createContext<StatusContextValue | null>(null)
