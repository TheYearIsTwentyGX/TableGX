import type { TableRowData } from '../types'

/**
 * Extracts a cell's editable string value: `String(value)`, or `''` for
 * null/undefined (spec §7.5).
 */
export function getCellEditValue<TRow extends TableRowData>(row: TRow, columnId: string): string {
  const value = row[columnId]
  return value === null || value === undefined ? '' : String(value)
}
