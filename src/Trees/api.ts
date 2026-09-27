import type { TreeResponse } from '../../shared/types.ts'
import { request } from '@/lib/http'

/** One level of the folder tree ("" is the library root). */
export function fetchTree(path: string): Promise<TreeResponse> {
  return request<TreeResponse>(`/api/tree?path=${encodeURIComponent(path)}`)
}

export type { TreeDir, TreeResponse } from '../../shared/types.ts'
