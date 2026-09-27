import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import type { CatalogStatus } from '../../../shared/types.ts'
import { useApiResource } from '@/lib/use-api-resource'
import { StatusContext } from '../context'
import type { StatusContextValue } from '../context'
import { fetchStatus, startScan } from '../api'

const SCAN_POLL_MS = 1000

/** Resolve once the API reports that no scan is running. */
async function waitForScanEnd(): Promise<void> {
  for (;;) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, SCAN_POLL_MS)
    })
    const status = await fetchStatus()
    if (!status.scanning) return
  }
}

/**
 * Owns the catalogue status: keeps it fresh while a scan runs, and reloads the
 * page when a rescan asked for by the user has finished, so every view is built
 * again from the new catalogue.
 */
export function StatusProvider({ children }: { children: ReactNode }) {
  const { data: status, loading, error, reload } = useApiResource<CatalogStatus>('status', fetchStatus)
  const [rescanPending, setRescanPending] = useState(false)

  // Poll the status endpoint while a scan is running.
  useEffect(() => {
    if (!status?.scanning) return
    const timer = window.setInterval(reload, SCAN_POLL_MS)
    return () => window.clearInterval(timer)
  }, [status?.scanning, reload])

  const rescan = useCallback(() => {
    setRescanPending(true)
    startScan()
      .then((result) => {
        if (result.alreadyRunning) toast.info('A scan is already running')
        else toast.info('Scan started', { description: 'The page reloads when it finishes.' })
        return waitForScanEnd()
      })
      .then(() => window.location.reload())
      .catch((cause: unknown) =>
        toast.error('Could not start the scan', { description: (cause as Error).message }),
      )
      .finally(() => setRescanPending(false))
  }, [])

  const value = useMemo<StatusContextValue>(
    () => ({
      status,
      loading,
      error,
      scanning: status?.scanning ?? false,
      rescanPending,
      rescan,
    }),
    [status, loading, error, rescanPending, rescan],
  )

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>
}
