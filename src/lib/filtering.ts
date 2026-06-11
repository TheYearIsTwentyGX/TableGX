import type { FilterFn, Row } from '@tanstack/react-table'
import type { ColumnFilterValue, TableRowData } from '../types'

/** True when the filter value no longer restricts anything. */
export function isEmptyFilterValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  const v = value as ColumnFilterValue
  return (v.text === undefined || v.text === '') && (v.checkedValues ?? null) === null
}

/** Core predicate shared by the table filterFn and cross-tab intersection. */
export function matchesFilterValue(cellValue: unknown, filterValue: ColumnFilterValue): boolean {
  const text = String(cellValue ?? '')
  if (filterValue.text) {
    if (!text.toLowerCase().includes(filterValue.text.toLowerCase())) return false
  }
  if (filterValue.checkedValues) {
    if (!filterValue.checkedValues.has(text)) return false
  }
  return true
}

/**
 * Default column filter: case-insensitive "includes" text search combined with
 * a faceted checklist of exact values (spec §10.1).
 */
export const tgxFilterFn: FilterFn<TableRowData> = (
  row: Row<TableRowData>,
  columnId: string,
  filterValue: ColumnFilterValue,
) => {
  if (isEmptyFilterValue(filterValue)) return true
  return matchesFilterValue(row.getValue(columnId), filterValue)
}

tgxFilterFn.autoRemove = (value: unknown) => isEmptyFilterValue(value)
