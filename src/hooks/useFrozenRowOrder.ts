import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table'
import { useMemo, useRef } from 'react'
import { findInsertionIndex } from '../lib/sortOrder'
import type { TableRowData } from '../types'

export interface UseFrozenRowOrderOptions<TRow extends TableRowData> {
  data: TRow[]
  getRowId: (row: TRow) => string
  columns: ColumnDef<TRow, unknown>[]
  sorting: SortingState
  /**
   * Nested row trees aren't reordered by this hook — bypassed entirely so
   * TanStack's own recursive per-level resort keeps working unchanged.
   */
  enableExpanding: boolean
}

export interface FrozenRowOrderResult<TRow extends TableRowData> {
  data: TRow[]
  /** Row ids spliced into the frozen order this render (never set on a real resort). */
  justInsertedRowIds: Set<string> | null
}

interface Committed<TRow extends TableRowData> {
  sorting: SortingState
  columns: ColumnDef<TRow, unknown>[]
  order: string[]
}

/**
 * Freezes row order across `data` changes so editing a value in the sorted
 * column doesn't immediately move that row. Order only recomputes in
 * response to a real sort action or a column-set change — never from a data
 * value change alone. New row ids are inserted at their comparator-correct
 * slot without disturbing the relative order of existing rows; removed ids
 * just drop out.
 */
export function useFrozenRowOrder<TRow extends TableRowData>({
  data,
  getRowId,
  columns,
  sorting,
  enableExpanding,
}: UseFrozenRowOrderOptions<TRow>): FrozenRowOrderResult<TRow> {
  const committedRef = useRef<Committed<TRow> | null>(null)

  // A cheap, non-rendering table purely to resolve column sort configs
  // (sortingFn/sortUndefined/invertSorting) and row values against LIVE
  // data. Constructing it and looking up core rows/columns is O(n) with no
  // comparator run; getSortedRowModel() is only ever invoked below, and only
  // on a real sort/column change.
  const valueTable = useReactTable<TRow>({
    data,
    columns,
    state: { sorting },
    onSortingChange: () => {},
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return useMemo(() => {
    const byId = new Map(data.map((row) => [getRowId(row), row]))
    const toRows = (ids: string[]): TRow[] =>
      ids.map((id) => byId.get(id)).filter((row): row is TRow => row !== undefined)

    if (enableExpanding || sorting.length === 0) {
      committedRef.current = null
      return { data, justInsertedRowIds: null }
    }

    const committed = committedRef.current
    const sortChanged = !committed || committed.sorting !== sorting || committed.columns !== columns

    if (sortChanged) {
      const order = valueTable.getSortedRowModel().rows.map((row) => row.id)
      committedRef.current = { sorting, columns, order }
      return { data: toRows(order), justInsertedRowIds: null }
    }

    const liveIdSet = new Set(data.map((row) => getRowId(row)))
    const survivors = committed.order.filter((id) => liveIdSet.has(id))
    const knownIds = new Set(survivors)
    const newIds = data.map((row) => getRowId(row)).filter((id) => !knownIds.has(id))

    if (newIds.length === 0) {
      committedRef.current = { sorting, columns, order: survivors }
      return { data: toRows(survivors), justInsertedRowIds: null }
    }

    const coreRowsById = valueTable.getCoreRowModel().rowsById
    const working = [...survivors]
    const justInsertedRowIds = new Set<string>()
    for (const id of newIds) {
      const candidateRow = coreRowsById[id]
      if (!candidateRow) continue
      const orderedRows = working
        .map((existingId) => coreRowsById[existingId])
        .filter((row): row is Row<TRow> => row !== undefined)
      const insertAt = findInsertionIndex(orderedRows, candidateRow, sorting, valueTable)
      working.splice(insertAt, 0, id)
      justInsertedRowIds.add(id)
    }

    committedRef.current = { sorting, columns, order: working }
    return { data: toRows(working), justInsertedRowIds }
    // valueTable is intentionally omitted: useReactTable returns a stable
    // ref mutated via setOptions, so it never changes identity and its
    // latest options are already applied by the time this factory runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sorting, columns, enableExpanding, getRowId])
}
