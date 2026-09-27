import type { CatalogStatus, ScanStarted } from '../../shared/types.ts'
import { postJson, request } from '@/lib/http'

/** Counters, scan state and timestamps of the local catalogue. */
export const fetchStatus = (): Promise<CatalogStatus> => request<CatalogStatus>('/api/status')

/** Start a background rescan; poll `fetchStatus` until `scanning` is false. */
export const startScan = (): Promise<ScanStarted> => postJson<ScanStarted>('/api/scan')
