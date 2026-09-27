import type { ReactNode } from 'react'
import { AlertTriangle, Boxes, Database, FolderTree, Loader2, RefreshCw } from 'lucide-react'
import { useStatus } from '@/Status/hooks/use-status'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime, formatRelative } from '@/lib/format'

/** Compact counter with an icon, used for the catalogue statistics. */
function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  const content = (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
      <span className="hidden text-xs text-muted-foreground sm:inline">{label}</span>
    </div>
  )

  if (!hint) return content

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Application header.
 *
 * It is common to every route, so it lives outside the pages and reads the
 * catalogue status from the status module.
 */
export function AppHeader() {
  const { status, loading, scanning, rescanPending, rescan } = useStatus()

  return (
    <header className="border-b border-border bg-card/30 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Boxes className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm leading-tight font-semibold">3D Print Catalog</h1>
            {status?.modelsRoot ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="max-w-[42vw] truncate font-mono text-xs text-muted-foreground">{status.modelsRoot}</p>
                </TooltipTrigger>
                <TooltipContent>{status.modelsRoot}</TooltipContent>
              </Tooltip>
            ) : (
              <Skeleton className="mt-1 h-3 w-56" />
            )}
          </div>
        </div>

        <Separator orientation="vertical" className="hidden h-8 lg:block" />

        <div className="flex flex-wrap items-center gap-2">
          {loading && !status ? (
            <>
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </>
          ) : (
            <>
              <Stat
                icon={<Boxes className="size-4" />}
                label="projects"
                value={(status?.projects ?? 0).toLocaleString()}
                hint="Folders that directly contain at least one model file"
              />
              <Stat
                icon={<Database className="size-4" />}
                label="models"
                value={(status?.models ?? 0).toLocaleString()}
                hint={`Indexed extensions: ${status?.modelExtensions.join(' ') ?? '—'}`}
              />
              <Stat
                icon={<FolderTree className="size-4" />}
                label="folders"
                value={(status?.dirs ?? 0).toLocaleString()}
                hint="Scanned directories, including the ones without models"
              />
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right lg:block">
            <p className="text-xs font-medium">
              {status?.lastScanAt ? formatRelative(status.lastScanAt) : 'never scanned'}
            </p>
            {status?.lastScanAt ? (
              <p className="text-[11px] text-muted-foreground">
                {formatDateTime(status.lastScanAt)}
                {status.lastScanDurationMs ? ` · ${(status.lastScanDurationMs / 1000).toFixed(1)}s` : ''}
              </p>
            ) : null}
          </div>
          <Button size="sm" variant="secondary" onClick={rescan} disabled={scanning || rescanPending}>
            {scanning || rescanPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {scanning ? 'Scanning…' : 'Rescan'}
          </Button>
        </div>
      </div>

      {status?.lastError ? (
        <div className="flex items-start gap-2 border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>Last scan failed: {status.lastError}</span>
        </div>
      ) : null}

      {status && !status.rootExists ? (
        <div className="flex items-start gap-2 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            MODELS_ROOT does not exist on disk: <span className="font-mono">{status.modelsRoot}</span>. Fix it in{' '}
            <span className="font-mono">.env</span> and rescan.
          </span>
        </div>
      ) : null}

      {scanning ? (
        <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Reading the filesystem and rebuilding the local database…
        </div>
      ) : null}
    </header>
  )
}
