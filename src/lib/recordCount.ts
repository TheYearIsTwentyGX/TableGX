import type { ReactNode } from 'react'
import type { RecordCountInfo, RecordCountLabel } from '../types'

/**
 * Default record-count text, shared by every render site (the toolbar count,
 * the bottom-right annotation, and the tabbed strips). When a filter narrows
 * the set it reads "Showing X of Y"; otherwise a single, locale-formatted
 * total (e.g. "1,234 rows"). A consumer `label` overrides the text entirely.
 */
export function formatRecordCount(
  info: RecordCountInfo,
  label?: RecordCountLabel,
): ReactNode {
  if (label) return label(info)
  const { filtered, total, isFiltered } = info
  if (isFiltered) {
    return `Showing ${filtered.toLocaleString()} of ${total.toLocaleString()}`
  }
  return `${total.toLocaleString()} ${total === 1 ? 'row' : 'rows'}`
}

/** Shared text styling for the record-count display across all render sites. */
export const RECORD_COUNT_CLASS = 'shrink-0 text-xs text-muted-foreground tabular-nums'
