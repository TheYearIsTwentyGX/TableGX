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

/** Column filter value pre-processed once per filter pass (resolveFilterValue). */
type ResolvedColumnFilterValue = ColumnFilterValue & { loweredText?: string }

/**
 * Default column filter: case-insensitive "includes" text search combined with
 * a faceted checklist of exact values (spec §10.1).
 */
export const tgxFilterFn: FilterFn<TableRowData> = (
  row: Row<TableRowData>,
  columnId: string,
  filterValue: ResolvedColumnFilterValue,
) => {
  if (isEmptyFilterValue(filterValue)) return true
  const text = String(row.getValue(columnId) ?? '')
  const needle = filterValue.loweredText ?? filterValue.text?.toLowerCase()
  if (needle) {
    if (!text.toLowerCase().includes(needle)) return false
  }
  if (filterValue.checkedValues) {
    if (!filterValue.checkedValues.has(text)) return false
  }
  return true
}

tgxFilterFn.autoRemove = (value: unknown) => isEmptyFilterValue(value)

// Lowercase the query once per filter pass instead of once per row.
tgxFilterFn.resolveFilterValue = (value: unknown): ResolvedColumnFilterValue => {
  const v = value as ColumnFilterValue
  return { ...v, loweredText: v?.text ? v.text.toLowerCase() : undefined }
}

/**
 * Case-insensitive "includes" match used by the built-in global search bar —
 * the same text semantics as {@link matchesFilterValue}, applied to a single
 * cell value against the global query. An empty query matches everything.
 */
export function matchesGlobalSearch(cellValue: unknown, query: string): boolean {
  if (!query) return true
  return String(cellValue ?? '')
    .toLowerCase()
    .includes(query.toLowerCase())
}

/**
 * Global-filter function for the table engine. TanStack applies it per
 * globally-filterable column and keeps a row when ANY column matches, giving
 * single-box "search across all columns" semantics. Which columns participate
 * is controlled by the engine's `getColumnCanGlobalFilter` resolver.
 */
export const tgxGlobalFilterFn: FilterFn<TableRowData> = (
  row: Row<TableRowData>,
  columnId: string,
  filterValue: unknown,
) => {
  // resolveFilterValue has already normalized + lowercased the query.
  const query = filterValue as string
  if (!query) return true
  return String(row.getValue(columnId) ?? '')
    .toLowerCase()
    .includes(query)
}

// Normalize + lowercase the query once per filter pass instead of once per cell.
tgxGlobalFilterFn.resolveFilterValue = (value: unknown): string =>
  (typeof value === 'string' ? value : String(value ?? '')).toLowerCase()
