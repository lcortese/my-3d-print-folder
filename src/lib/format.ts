/** Human readable file size, e.g. 1536 -> "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

/** Format an epoch timestamp using the browser locale. */
export function formatDateTime(epochMs: number | null | undefined): string {
  if (!epochMs || !Number.isFinite(epochMs)) return '—'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(epochMs))
}

/** Relative time such as "3 days ago", used in tooltips. */
export function formatRelative(epochMs: number | null | undefined): string {
  if (!epochMs || !Number.isFinite(epochMs)) return '—'
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const diffSeconds = Math.round((epochMs - Date.now()) / 1000)
  const thresholds: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ]

  for (const [unit, seconds] of thresholds) {
    if (Math.abs(diffSeconds) >= seconds) {
      return formatter.format(Math.round(diffSeconds / seconds), unit)
    }
  }
  return formatter.format(diffSeconds, 'second')
}

/**
 * Short explanation of where the "created at" value comes from. Linux mounts
 * of Windows drives report no birth time, so the value may be approximate.
 */
export function describeCreatedSource(source: 'birthtime' | 'ctime' | 'mtime'): string {
  switch (source) {
    case 'birthtime':
      return 'Real creation time reported by the filesystem.'
    case 'ctime':
      return 'Filesystem does not expose a creation time: metadata change time is used instead.'
    case 'mtime':
      return 'Filesystem does not expose a creation time: modification time is used instead.'
  }
}
