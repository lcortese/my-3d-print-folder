import type { ProjectFilters, ProjectPage, ProjectPagination, ProjectSorting } from '../api'
import { fetchProjects } from '../api'
import { useApiResource } from '@/lib/use-api-resource'
import type { ApiResource } from '@/lib/use-api-resource'

/**
 * Parameter groups of the listing. Every group is optional: one may still be
 * undefined while whatever feeds it is loading.
 */
export interface ProjectQueryParams {
  filters?: ProjectFilters
  sorting?: ProjectSorting
  pagination?: ProjectPagination
}

/** Projects matching the given parameters. */
export function useProjects(params: ProjectQueryParams): ApiResource<ProjectPage> {
  const { filters = {}, sorting = {}, pagination = {} } = params

  return useApiResource<ProjectPage>(`projects:${JSON.stringify([filters, sorting, pagination])}`, () =>
    fetchProjects(filters, sorting, pagination),
  )
}
