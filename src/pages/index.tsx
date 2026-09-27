import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type { ProjectFilters, ProjectPagination, ProjectSort, ProjectSorting } from '@/Projects/api'
import { ProjectsPage } from '@/Projects/components/projects-page'

const SORT_OPTIONS: ProjectSort[] = ['name', 'category', 'createdAt', 'modifiedAt', 'modelCount', 'modelBytes']
const PAGE_SIZES = [25, 50, 100, 200]

/** Page parameters, grouped the same way the api and the page work with them. */
interface PageParams {
  filters: ProjectFilters
  sorting: ProjectSorting
  pagination: ProjectPagination
}

/**
 * Read the parameters from the query string.
 *
 * This is the only sanitizing point, and it never invents a value: a parameter
 * that is absent (or not valid) stays undefined, so the API resolves it with its
 * own defaults. Nothing is ever written back to correct the URL.
 */
function readParams(searchParams: URLSearchParams): PageParams {
  const scope = searchParams.get('scope')
  const q = searchParams.get('q')
  const sort = searchParams.get('sort')
  const dir = searchParams.get('dir')
  const page = Number.parseInt(searchParams.get('page') ?? '', 10)
  const pageSize = Number.parseInt(searchParams.get('pageSize') ?? '', 10)

  return {
    filters: {
      scope: scope || undefined,
      q: q || undefined,
    },
    sorting: {
      sort: SORT_OPTIONS.includes(sort as ProjectSort) ? (sort as ProjectSort) : undefined,
      dir: dir === 'asc' || dir === 'desc' ? dir : undefined,
    },
    pagination: {
      page: Number.isFinite(page) && page > 0 ? page : undefined,
      pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : undefined,
    },
  }
}

/** Serialize the parameters, omitting whatever is not set. */
function toSearchParams({ filters, sorting, pagination }: PageParams): URLSearchParams {
  const searchParams = new URLSearchParams()
  if (filters.scope) searchParams.set('scope', filters.scope)
  if (filters.q) searchParams.set('q', filters.q)
  if (sorting.sort) searchParams.set('sort', sorting.sort)
  if (sorting.dir) searchParams.set('dir', sorting.dir)
  if (pagination.page) searchParams.set('page', String(pagination.page))
  if (pagination.pageSize) searchParams.set('pageSize', String(pagination.pageSize))
  return searchParams
}

/**
 * Route "/".
 *
 * Owns the page parameters in the query string: it reads and sanitizes them,
 * hands them to the projects page and writes back every change it asks for.
 *
 * Changing what is listed (filters or sorting) drops the page parameter, so the
 * listing goes back to the first page in the same write as the change itself.
 */
export default function IndexPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = readParams(searchParams)

  const handleFiltersChange = useCallback(
    (filters: ProjectFilters) => {
      const next: PageParams = { ...params, filters, pagination: { ...params.pagination, page: undefined } }
      // Typing in the search box must not fill the browser history.
      setSearchParams(toSearchParams(next), { replace: filters.q !== params.filters.q })
    },
    [params, setSearchParams],
  )

  const handleSortingChange = useCallback(
    (sorting: ProjectSorting) => {
      const next: PageParams = { ...params, sorting, pagination: { ...params.pagination, page: undefined } }
      setSearchParams(toSearchParams(next))
    },
    [params, setSearchParams],
  )

  const handlePaginationChange = useCallback(
    (pagination: ProjectPagination) => {
      setSearchParams(toSearchParams({ ...params, pagination }))
    },
    [params, setSearchParams],
  )

  return (
    <ProjectsPage
      {...params}
      onFiltersChange={handleFiltersChange}
      onSortingChange={handleSortingChange}
      onPaginationChange={handlePaginationChange}
    />
  )
}
