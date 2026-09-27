import type { ProjectQuery } from '../../../shared/types.ts'

/**
 * Parameter groups of the projects module.
 *
 * They are derived from the API contract (`ProjectQuery`), so there is a single
 * source of truth, and every field is optional: a field that is not set stays
 * `undefined` all the way to the API, which resolves its own defaults. Nothing
 * in the app invents a value for a parameter that is not there.
 */

/** Free text filter and folder scope of the listing. */
export type ProjectFilters = Pick<ProjectQuery, 'scope' | 'q'>

/** Column and direction the listing is ordered by. */
export type ProjectSorting = Pick<ProjectQuery, 'sort' | 'dir'>

/** Window of the listing. */
export type ProjectPagination = Pick<ProjectQuery, 'page' | 'pageSize'>

/** Everything the module exposes as types: the API contract plus the groups. */
export type {
  ModelFile,
  Project,
  ProjectPage,
  ProjectQuery,
  ProjectSort,
  SortDirection,
} from '../../../shared/types.ts'
