const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parses a date-only value without timezone off-by-one errors.
 * `"YYYY-MM-DD"` strings are interpreted at midnight UTC. Date instances pass
 * through; anything else returns null.
 */
export function parseDateSafe(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value !== 'string') return null
  const match = DATE_ONLY_RE.exec(value.trim())
  if (match) {
    const [, y, m, d] = match
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    return Number.isNaN(date.getTime()) ? null : date
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Formats a date-only value as `MM/dd/yyyy` using UTC fields so the displayed
 * day never shifts with the local timezone.
 */
export function formatDateSafe(value: unknown): string {
  const date = parseDateSafe(value)
  if (!date) return ''
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0')
  return `${mm}/${dd}/${yyyy}`
}
