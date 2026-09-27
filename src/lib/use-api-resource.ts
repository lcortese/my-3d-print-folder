import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { loadResource, readResource, subscribeResource } from './resource-store'
import type { ResourceSnapshot } from './resource-store'

export interface ApiResource<T> extends ResourceSnapshot<T> {
  /** Load the key again, e.g. to retry after an error or to poll. */
  reload: () => void
}

/**
 * Subscribe to a resource by key.
 *
 * The state lives in the resource store, so every component asking for the same
 * key shares one request, a cached key is served instantly and revalidated in
 * the background, and all subscribers receive the new values when it settles.
 */
export function useApiResource<T>(key: string, loader: () => Promise<T>): ApiResource<T> {
  const subscribe = useCallback((onChange: () => void) => subscribeResource(key, onChange), [key])
  const getSnapshot = useCallback(() => readResource<T>(key), [key])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  // `loader` is deliberately not a dependency: the key identifies the request,
  // so the closure captured when the key changes is always the right one.
  useEffect(() => {
    loadResource(key, loader)
  }, [key])

  const reload = useCallback(() => loadResource(key, loader), [key])

  return { ...snapshot, reload }
}
