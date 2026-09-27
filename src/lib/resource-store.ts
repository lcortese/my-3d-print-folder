/**
 * Index of resource states, keyed by the parametrization that produced them.
 *
 * Every hook that resolves a resource goes through here, so two components
 * asking for the same key share a single request, and a key that already has
 * data is served from the cache instantly while it is revalidated in the
 * background. When the revalidation settles, every subscriber gets the new
 * values.
 */

export interface ResourceSnapshot<T> {
  /** Undefined while there is no data for the key. */
  data?: T
  /** Undefined while the last request succeeded (or never ran). */
  error?: string
  /** True while the first load of this key runs (there is no data yet). */
  loading: boolean
  /** True while fresh data is being fetched on top of cached data. */
  validating: boolean
}

interface ResourceEntry<T> {
  snapshot: ResourceSnapshot<T>
  /** Request in flight for this key, undefined when there is none. */
  promise?: Promise<void>
}

/** Snapshot returned for keys that were never loaded. */
const IDLE: ResourceSnapshot<never> = { loading: false, validating: false }

const entries = new Map<string, ResourceEntry<unknown>>()
const keyListeners = new Map<string, Set<() => void>>()

/** Wake up every listener interested in this key. */
function notify(key: string): void {
  for (const listener of keyListeners.get(key) ?? []) listener()
}

/** Current state of a key. Unknown keys read as an idle snapshot. */
export function readResource<T>(key: string): ResourceSnapshot<T> {
  return (entries.get(key)?.snapshot as ResourceSnapshot<T> | undefined) ?? (IDLE as ResourceSnapshot<T>)
}

/** Subscribe to a key. */
export function subscribeResource(key: string, listener: () => void): () => void {
  const listeners = keyListeners.get(key) ?? new Set<() => void>()
  listeners.add(listener)
  keyListeners.set(key, listeners)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Load a key.
 *
 * If a request for the key is already in flight nothing happens, so overlapping
 * consumers (including the double effect invocation of React in development)
 * produce a single call. With cached data the request runs as a revalidation:
 * the cache keeps being served until the new values arrive.
 */
export function loadResource<T>(key: string, loader: () => Promise<T>): void {
  const existing = entries.get(key) as ResourceEntry<T> | undefined
  const entry: ResourceEntry<T> = existing ?? { snapshot: { ...IDLE } }
  entries.set(key, entry as ResourceEntry<unknown>)

  if (entry.promise) return

  const hasData = entry.snapshot.data !== undefined
  entry.snapshot = { ...entry.snapshot, loading: !hasData, validating: hasData, error: undefined }
  notify(key)

  entry.promise = loader()
    .then((data) => {
      entry.snapshot = { data, loading: false, validating: false }
    })
    .catch((cause: unknown) => {
      entry.snapshot = {
        ...entry.snapshot,
        error: cause instanceof Error ? cause.message : String(cause),
        loading: false,
        validating: false,
      }
    })
    .finally(() => {
      entry.promise = undefined
      notify(key)
    })
}
