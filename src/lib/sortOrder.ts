import type { Column, Row, SortingState, Table } from '@tanstack/react-table'
import type { TableRowData } from '../types'

/**
 * Mirrors TanStack's own getSortedRowModel comparator loop (per-column
 * sortingFn, sortUndefined, desc, invertSorting, multi-sort priority) so a
 * new row can be positioned exactly where a real resort would place it,
 * without reimplementing sortingFn/accessor resolution ourselves.
 */
export function compareRowsBySorting<TRow extends TableRowData>(
  rowA: Row<TRow>,
  rowB: Row<TRow>,
  sorting: SortingState,
  table: Table<TRow>,
): number {
  for (const sortEntry of sorting) {
    const column = table.getColumn(sortEntry.id) as Column<TRow, unknown> | undefined
    if (!column || !column.getCanSort()) continue

    const sortUndefined = column.columnDef.sortUndefined
    const isDesc = sortEntry.desc
    let sortInt = 0

    if (sortUndefined) {
      const aValue = rowA.getValue(sortEntry.id)
      const bValue = rowB.getValue(sortEntry.id)
      const aUndefined = aValue === undefined
      const bUndefined = bValue === undefined
      if (aUndefined || bUndefined) {
        if (sortUndefined === 'first') return aUndefined ? -1 : 1
        if (sortUndefined === 'last') return aUndefined ? 1 : -1
        sortInt = aUndefined && bUndefined ? 0 : aUndefined ? sortUndefined : -sortUndefined
      }
    }

    if (sortInt === 0) sortInt = column.getSortingFn()(rowA, rowB, sortEntry.id)

    if (sortInt !== 0) {
      if (isDesc) sortInt *= -1
      if (column.columnDef.invertSorting) sortInt *= -1
      return sortInt
    }
  }
  return 0
}

/**
 * Finds where `candidate` belongs among `orderedRows` per the current sort
 * comparator. A linear scan, not a binary search: once edits have moved a
 * row's live value away from its frozen slot, `orderedRows` may no longer be
 * strictly sorted by current values, so a binary search over it isn't
 * reliable — a linear scan always finds *a* comparator-consistent slot.
 */
export function findInsertionIndex<TRow extends TableRowData>(
  orderedRows: Row<TRow>[],
  candidate: Row<TRow>,
  sorting: SortingState,
  table: Table<TRow>,
): number {
  for (let i = 0; i < orderedRows.length; i++) {
    if (compareRowsBySorting(candidate, orderedRows[i]!, sorting, table) < 0) return i
  }
  return orderedRows.length
}
