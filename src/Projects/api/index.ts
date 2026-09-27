import type { ProjectPage } from '../../../shared/types.ts'
import { postJson, request } from '@/lib/http'
import type { ProjectFilters, ProjectPagination, ProjectSorting } from './types'

/** Result of asking the OS file manager to open a path. */
export interface RevealResponse {
  ok: boolean
  target: string
  command: string
}

/**
 * Paginated, filtered and sorted project listing.
 *
 * Every field is optional: whatever is not sent is resolved by the API with its
 * own defaults.
 */
export function fetchProjects(
  filters: ProjectFilters = {},
  sorting: ProjectSorting = {},
  pagination: ProjectPagination = {},
): Promise<ProjectPage> {
  const params = new URLSearchParams()
  if (filters.scope) params.set('scope', filters.scope)
  if (filters.q) params.set('q', filters.q)
  if (sorting.sort) params.set('sort', sorting.sort)
  if (sorting.dir) params.set('dir', sorting.dir)
  if (pagination.page) params.set('page', String(pagination.page))
  if (pagination.pageSize) params.set('pageSize', String(pagination.pageSize))
  return request<ProjectPage>(`/api/projects?${params.toString()}`)
}

/** Open a project folder, or one of its files, in the OS file manager. */
export function revealInFileManager(body: {
  projectId?: number
  relPath?: string
  selectFile?: boolean
}): Promise<RevealResponse> {
  return postJson<RevealResponse>('/api/reveal', body)
}

export type { ProjectFilters, ProjectPagination, ProjectSorting } from './types'
export type { ModelFile, Project, ProjectPage, ProjectQuery, ProjectSort, SortDirection } from './types'
