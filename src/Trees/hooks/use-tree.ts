import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { TreeDir, TreeResponse } from '../api'
import { fetchTree } from '../api'
import { useApiResource } from '@/lib/use-api-resource'

/** Store key of the root level, shared by every consumer of the library root. */
const TREE_ROOT_KEY = 'tree:root'

/** Root level of the library. Every field is undefined until the API answers. */
export interface TreeRoot {
  name?: string
  projectCount?: number
  children?: TreeDir[]
  loading: boolean
  error?: string
}

/** Root level plus the levels that are loaded. */
export interface TreeData extends TreeRoot {
  /** Children of a folder, or undefined while its level is not loaded. */
  childrenOf: (path: string) => TreeDir[] | undefined
  /** True while that level is being loaded. */
  isLoading: (path: string) => boolean
}

/** Levels in flight, by folder: two consumers of the same level share one call. */
const inFlight = new Map<string, Promise<TreeDir[]>>()

/** Children of a folder, reusing the request if one is already in flight. */
function requestLevel(path: string): Promise<TreeDir[]> {
  const pending = inFlight.get(path)
  if (pending) return pending

  const promise = fetchTree(path)
    .then((response) => response.children)
    .finally(() => inFlight.delete(path))

  inFlight.set(path, promise)
  return promise
}

/** Root level of the tree: library name, project total and the category list. */
export function useTreeRoot(): TreeRoot {
  const { data, loading, error } = useApiResource<TreeResponse>(TREE_ROOT_KEY, () => fetchTree(''))

  return {
    name: data?.name,
    projectCount: data?.projectCount,
    children: data?.children,
    loading,
    error,
  }
}

/**
 * Data for the tree that is being shown.
 *
 * It resolves the levels of the folders that are open, only the ones that are
 * not loaded yet, and keeps them in the hook: the tree that asks for a folder is
 * the one that draws it.
 */
export function useTree(expandedPaths: string[]): TreeData {
  const root = useTreeRoot()
  const [levels, setLevels] = useState<Record<string, TreeDir[]>>({})
  const [pending, setPending] = useState<readonly string[]>([])

  // A stable dependency: the levels only change when the open folders change.
  const openPaths = expandedPaths.join('|')

  useEffect(() => {
    for (const path of expandedPaths) {
      // The root level is owned by `useTreeRoot`.
      if (path === '') continue
      if (levels[path] !== undefined || pending.includes(path)) continue

      setPending((current) => [...current, path])
      requestLevel(path)
        .then((children) => setLevels((current) => ({ ...current, [path]: children })))
        .catch((cause: unknown) => toast.error(`Cannot read "${path}": ${(cause as Error).message}`))
        .finally(() => setPending((current) => current.filter((item) => item !== path)))
    }
  }, [openPaths])

  const childrenOf = useCallback((path: string) => levels[path], [levels])

  const isLoading = useCallback((path: string) => pending.includes(path), [pending])

  return { ...root, childrenOf, isLoading }
}
