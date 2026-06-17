import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type Cell,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  type OnChangeFn,
  type Row,
  type SortingState,
  type Table,
  type VisibilityState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion, type MotionValue } from 'framer-motion'
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FROZEN_PANE_MAX_FRACTION,
  HEADER_HEIGHT_PX,
  MIN_COLUMN_WIDTH_PX,
  ROW_HEIGHT_PX,
  SELECTION_COLUMN_ID,
  SELECTION_COLUMN_WIDTH_PX,
} from '../constants'
import { getColumnId, useAutoColumnWidths } from '../hooks/useAutoColumnWidths'
import { useColumnVirtualization } from '../hooks/useColumnVirtualization'
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect'
import { useLocalStorageState } from '../hooks/useLocalStorageState'
import { useRowSelectionBridge } from '../hooks/useRowSelectionBridge'
import { getCellEditValue } from '../lib/cell'
import { cn } from '../lib/cn'
import { computeAggregate, formatAggregate } from '../lib/aggregates'
import { matchesFilterValue, tgxFilterFn, isEmptyFilterValue } from '../lib/filtering'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import type {
  ColumnFilterValue,
  ColumnGroupDef,
  EditingState,
  ReadOnlyTableProps,
  RecordCountInfo,
  SaveEditFn,
  TableRowData,
} from '../types'
import { formatRecordCount, RECORD_COUNT_CLASS } from '../lib/recordCount'
import { BodyCell } from './BodyCell'
import type { EditNavigation } from './CellEditors'
import { ColumnVisibilityPicker } from './ColumnVisibilityPicker'
import { describeFilterValue, FilterBadges, type FilterBadgeItem } from './FilterBadges'
import { HeaderCell } from './HeaderCell'
import { TableSkeleton } from './TableSkeleton'

const GROUP_HEADER_HEIGHT_PX = 32
const FOOTER_HEIGHT_PX = 40
const ROW_OVERSCAN = 8
// Scroll-pane cells render in fixed chunks of this many columns. When the
// virtual window slides, chunks already on screen keep identical props and
// their memoized subtrees are reused wholesale — per commit, React only
// creates elements for the chunks entering the window instead of recreating
// every cell element in every row.
const CHUNK_COLUMNS = 8

const PINNED_BODY_BG_CLASSES =
  'bg-card transition-colors group-hover:bg-(--tgx-row-hover-bg) group-data-[selected]:bg-(--tgx-row-selected-bg) group-hover:group-data-[selected]:bg-(--tgx-row-selected-hover-bg)'

export type TableCoreProps<TRow extends TableRowData> = ReadOnlyTableProps<TRow> & {
  editable: boolean
  editableColumnIds?: string[]
  onSaveEdit?: SaveEditFn<TRow>
  isSubmitting?: boolean
  singleClickEdit?: boolean
  columnGroups?: ColumnGroupDef[]
  getCellClassName?: (row: TRow, columnId: string) => string | undefined
  /** Internal — TabbedTable lifts column visibility into the tab strip. */
  controlledVisibility?: VisibilityState
  onControlledVisibilityChange?: OnChangeFn<VisibilityState>
  /** Internal — TabbedTable persists per-tab sorting across tab switches. */
  controlledSorting?: SortingState
  onControlledSortingChange?: OnChangeFn<SortingState>
  /**
   * Internal — leaf column defs referenced by the shared sort that this tab
   * doesn't render. They're registered as hidden, sort-only columns so the
   * engine can order rows by a column owned by another tab without warning.
   */
  sortOnlyColumns?: ColumnDef<TRow, unknown>[]
  /** Internal — TabbedTable renders its own picker / badges. */
  hideBuiltInPicker?: boolean
  hideFilterBadges?: boolean
  /**
   * Internal — when false the top-placed record count is not drawn in this
   * table's toolbar. The tabbed shells set this so the count lives in the tab
   * strip instead of forcing a second toolbar row beneath it (paired with
   * {@link onRecordCountChange}). Default true.
   */
  recordCountInToolbar?: boolean
  /** Internal — reports the computed leaf counts up so a tab strip can render them. */
  onRecordCountChange?: (info: RecordCountInfo | null) => void
  /** Internal — negated tab-slide x offset keeping the pinned pane static (spec §18.5). */
  pinnedPaneX?: MotionValue<number>
}

function headerLabelOf<TRow extends TableRowData>(
  columnDef: ColumnDef<TRow, unknown>,
  id: string,
  columnLabel?: (columnId: string) => string,
): string {
  if (columnLabel) return columnLabel(id)
  return typeof columnDef.header === 'string' ? columnDef.header : id
}

/**
 * Strip a column def down to just what the sorting engine needs — its value
 * accessor and any explicit sort behavior — dropping the header, cell, filter,
 * footer, and meta. Used for foreign columns referenced by a shared sort that
 * the current tab doesn't render (see `sortOnlyColumns`).
 */
function toSortOnlyColumn<TRow extends TableRowData>(
  col: ColumnDef<TRow, unknown>,
  id: string,
): ColumnDef<TRow, unknown> {
  const c = col as ColumnDef<TRow, unknown> & {
    accessorKey?: string
    accessorFn?: (row: TRow, index: number) => unknown
    sortingFn?: unknown
    sortDescFirst?: boolean
    sortUndefined?: unknown
  }
  const out: Record<string, unknown> = {
    id,
    enableColumnFilter: false,
    enableHiding: false,
    enableResizing: false,
  }
  if (c.accessorFn) out.accessorFn = c.accessorFn
  else out.accessorKey = c.accessorKey ?? id
  if (c.sortingFn !== undefined) out.sortingFn = c.sortingFn
  if (c.sortDescFirst !== undefined) out.sortDescFirst = c.sortDescFirst
  if (c.sortUndefined !== undefined) out.sortUndefined = c.sortUndefined
  return out as unknown as ColumnDef<TRow, unknown>
}

// ----- Memoized virtual row -----------------------------------------------
//
// Scrolling re-renders TableCore (virtual ranges change), but unchanged rows
// keep identical props and skip re-rendering entirely thanks to React.memo.
// isSelected / isSomeSelected / isExpanded exist purely to invalidate the memo
// when TanStack state changes without replacing the Row instance.

/** Props shared by every scroll-pane cell of a row. */
type RowCellContext<TRow extends TableRowData> = {
  row: Row<TRow>
  pinnedCount: number
  /**
   * Memo invalidation key: ids of the currently-visible leaf columns. Cells
   * are read from `row.getVisibleCells()` (the Row instance itself is
   * referentially stable), so visibility changes are invisible to the memos
   * without this.
   */
  columnsKey: string
  widthOf: (columnId: string) => number
  expandColumnId: string | null
  /** Non-null only when this row hosts the active editor. */
  editing: EditingState
  editorsDisabled: boolean
  isSubmitting: boolean
  singleClickEdit: boolean
  canEditColumn: (columnId: string, meta: { editable?: boolean } | undefined) => boolean
  onBeginEdit: (cell: Cell<TRow, unknown>) => void
  onCommitEdit: (
    cell: Cell<TRow, unknown>,
    value: string | number | boolean,
    nav?: EditNavigation,
  ) => void
  onCancelEdit: () => void
  onDirectBooleanSave: (cell: Cell<TRow, unknown>, value: boolean) => void
  getCellClassName?: (row: TRow, columnId: string) => string | undefined
  bodyCellClassName?: string
}

type RowCellChunkProps<TRow extends TableRowData> = RowCellContext<TRow> & {
  /** Chunk index into the scroll columns (columns chunk*N .. chunk*N+N-1). */
  chunk: number
  /** Absolute left edge of the chunk within the content (incl. pinned width). */
  left: number
  /** Live expand state when this chunk hosts the expand column, else false. */
  isExpanded: boolean
}

function renderBodyCell<TRow extends TableRowData>(
  cell: Cell<TRow, unknown>,
  width: number,
  stateKey: unknown,
  ctx: RowCellContext<TRow>,
) {
  const columnId = cell.column.id
  const { editing } = ctx
  const isEditingCell = editing !== null && editing.columnId === columnId
  return (
    <BodyCell
      key={columnId}
      cell={cell}
      width={width}
      isEditing={isEditingCell}
      canEdit={ctx.canEditColumn(columnId, cell.column.columnDef.meta)}
      singleClickEdit={ctx.singleClickEdit}
      editorsDisabled={ctx.editorsDisabled}
      isSubmitting={ctx.isSubmitting}
      initialEditValue={isEditingCell && editing ? editing.initialValue : ''}
      onBeginEdit={ctx.onBeginEdit}
      onCommitEdit={ctx.onCommitEdit}
      onCancelEdit={ctx.onCancelEdit}
      onDirectBooleanSave={ctx.onDirectBooleanSave}
      showExpandControl={columnId === ctx.expandColumnId}
      stateKey={stateKey}
      className={cn(ctx.bodyCellClassName, ctx.getCellClassName?.(ctx.row.original, columnId))}
    />
  )
}

function RowCellChunkInner<TRow extends TableRowData>(props: RowCellChunkProps<TRow>) {
  const { row, chunk, left, pinnedCount, expandColumnId, isExpanded } = props
  const cells = row.getVisibleCells()
  const from = pinnedCount + chunk * CHUNK_COLUMNS
  const slice = cells.slice(from, from + CHUNK_COLUMNS)
  return (
    <div className="absolute top-0 bottom-0 flex" style={{ left }}>
      {slice.map((cell) =>
        renderBodyCell(
          cell,
          props.widthOf(cell.column.id),
          cell.column.id === expandColumnId ? isExpanded : undefined,
          props,
        ),
      )}
    </div>
  )
}

const RowCellChunk = React.memo(RowCellChunkInner) as typeof RowCellChunkInner

type VirtualRowProps<TRow extends TableRowData> = RowCellContext<TRow> & {
  top: number
  pinnedWidth: number
  /** Inclusive chunk range covering the current virtual column window. */
  chunkFrom: number
  chunkTo: number
  /** Stable: absolute left edge of a chunk (depends only on column widths). */
  chunkLeftOf: (chunk: number) => number
  pinnedWidthOf: (columnId: string) => number
  isSelected: boolean
  isSomeSelected: boolean
  isExpanded: boolean
  bodyRowClassName?: string
  pinnedPaneX?: MotionValue<number>
}

function VirtualRowInner<TRow extends TableRowData>(props: VirtualRowProps<TRow>) {
  const {
    row,
    top,
    pinnedCount,
    pinnedWidth,
    chunkFrom,
    chunkTo,
    chunkLeftOf,
    pinnedWidthOf,
    expandColumnId,
    isSelected,
    isSomeSelected,
    isExpanded,
    bodyRowClassName,
    pinnedPaneX,
  } = props

  const cells = row.getVisibleCells()

  // The expand column sits in the scroll pane when nothing is pinned; the
  // hosting chunk must see live expand state while the others stay static.
  let expandChunk = -1
  if (expandColumnId !== null) {
    const idx = cells.findIndex((c) => c.column.id === expandColumnId)
    if (idx >= pinnedCount) expandChunk = Math.floor((idx - pinnedCount) / CHUNK_COLUMNS)
  }

  const chunks: React.ReactNode[] = []
  for (let chunk = Math.max(0, chunkFrom); chunk <= chunkTo; chunk++) {
    chunks.push(
      <RowCellChunk<TRow>
        key={chunk}
        chunk={chunk}
        left={chunkLeftOf(chunk)}
        isExpanded={chunk === expandChunk ? isExpanded : false}
        row={row}
        pinnedCount={pinnedCount}
        columnsKey={props.columnsKey}
        widthOf={props.widthOf}
        expandColumnId={expandColumnId}
        editing={props.editing}
        editorsDisabled={props.editorsDisabled}
        isSubmitting={props.isSubmitting}
        singleClickEdit={props.singleClickEdit}
        canEditColumn={props.canEditColumn}
        onBeginEdit={props.onBeginEdit}
        onCommitEdit={props.onCommitEdit}
        onCancelEdit={props.onCancelEdit}
        onDirectBooleanSave={props.onDirectBooleanSave}
        getCellClassName={props.getCellClassName}
        bodyCellClassName={props.bodyCellClassName}
      />,
    )
  }

  return (
    <div
      data-tgx-row={row.id}
      data-selected={isSelected ? '' : undefined}
      className={cn(
        'group absolute top-0 left-0 flex w-full border-b border-border bg-card transition-colors hover:bg-(--tgx-row-hover-bg) data-[selected]:bg-(--tgx-row-selected-bg) hover:data-[selected]:bg-(--tgx-row-selected-hover-bg)',
        bodyRowClassName,
      )}
      style={{ height: ROW_HEIGHT_PX, transform: `translateY(${top}px)` }}
    >
      {pinnedCount > 0 && (
        <motion.div
          data-tgx-pinned=""
          className={cn(
            'sticky left-0 z-10 flex h-full shrink-0 border-r border-border',
            PINNED_BODY_BG_CLASSES,
          )}
          style={{ width: pinnedWidth, x: pinnedPaneX }}
        >
          {cells.slice(0, pinnedCount).map((cell) =>
            renderBodyCell(
              cell,
              pinnedWidthOf(cell.column.id),
              // Cells that render Row-derived TanStack state need a memo
              // invalidation key because the Row instance is referentially
              // stable across selection/expand changes.
              cell.column.id === SELECTION_COLUMN_ID
                ? `${isSelected}:${isSomeSelected}`
                : cell.column.id === expandColumnId
                  ? isExpanded
                  : undefined,
              props,
            ),
          )}
        </motion.div>
      )}
      {chunks}
    </div>
  )
}

const VirtualRow = React.memo(VirtualRowInner) as typeof VirtualRowInner

// ----- TableCore ------------------------------------------------------------

/**
 * The single rendering engine behind ReadOnlyTable / EditableTable /
 * TabbedTable. Owns the split frozen/scrollable pane layout, row + column
 * virtualization, scroll sync, hover sync, auto widths, and column resize.
 */
export function TableCore<TRow extends TableRowData>(props: TableCoreProps<TRow>) {
  const {
    data,
    columns,
    getRowId,
    toolbar,
    maxHeight,
    emptyMessage = 'No results found',
    isLoading,
    loadingSkeleton,
    bordered = true,
    frozenColumns = 0,
    columnFilters: controlledFilters,
    onColumnFiltersChange,
    initialSorting,
    measure,
    includeHeaderInAutosize,
    columnLabel,
    classNames,
    enableMultiSort = false,
    enableRowSelection = false,
    selectedRowIds,
    onSelectedRowIdsChange,
    enableColumnVisibility = false,
    columnVisibilityStorageKey,
    enableFooter = false,
    enableRecordCount = false,
    recordCountPosition = 'top',
    recordCountLabel,
    recordCountInToolbar = true,
    onRecordCountChange,
    enableExpanding = false,
    getSubRows,
    expanded: controlledExpanded,
    onExpandedChange,
    defaultExpanded,
    editable,
    editableColumnIds,
    onSaveEdit,
    isSubmitting = false,
    singleClickEdit = false,
    columnGroups,
    getCellClassName,
    controlledVisibility,
    onControlledVisibilityChange,
    controlledSorting,
    onControlledSortingChange,
    sortOnlyColumns,
    hideBuiltInPicker = false,
    hideFilterBadges = false,
    pinnedPaneX,
  } = props

  // ----- Table state -----

  const [internalSorting, setInternalSorting] = useState<SortingState>(initialSorting ?? [])
  const sorting = controlledSorting ?? internalSorting
  const handleSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      if (onControlledSortingChange) {
        onControlledSortingChange(updater)
        return
      }
      setInternalSorting(updater)
    },
    [onControlledSortingChange],
  )

  const [internalFilters, setInternalFilters] = useState<ColumnFiltersState>([])
  const filters = controlledFilters ?? internalFilters
  const handleFiltersChange = useCallback<OnChangeFn<ColumnFiltersState>>(
    (updater) => {
      if (onColumnFiltersChange) {
        onColumnFiltersChange(updater as React.SetStateAction<ColumnFiltersState>)
      }
      if (controlledFilters === undefined) setInternalFilters(updater)
    },
    [onColumnFiltersChange, controlledFilters],
  )

  const [storedVisibility, setStoredVisibility] = useLocalStorageState<VisibilityState>(
    columnVisibilityStorageKey,
    {},
  )
  const visibility = controlledVisibility ?? storedVisibility
  const handleVisibilityChange = useCallback<OnChangeFn<VisibilityState>>(
    (updater) => {
      if (onControlledVisibilityChange) {
        onControlledVisibilityChange(updater)
        return
      }
      setStoredVisibility((prev) => (typeof updater === 'function' ? updater(prev) : updater))
    },
    [onControlledVisibilityChange, setStoredVisibility],
  )

  const [rowSelection, handleRowSelectionChange] = useRowSelectionBridge(
    enableRowSelection ? selectedRowIds : undefined,
    onSelectedRowIdsChange,
  )

  const tableRef = useRef<Table<TRow> | null>(null)

  const [internalExpanded, setInternalExpanded] = useState<ExpandedState>(() => {
    if (defaultExpanded === true) return true
    if (defaultExpanded && typeof defaultExpanded === 'object') return defaultExpanded
    return {}
  })
  const expandedState: ExpandedState = controlledExpanded ?? internalExpanded
  const expandedRef = useRef(expandedState)
  expandedRef.current = expandedState
  const onExpandedChangeRef = useRef(onExpandedChange)
  onExpandedChangeRef.current = onExpandedChange
  const handleExpandedChange = useCallback<OnChangeFn<ExpandedState>>((updater) => {
    const next = typeof updater === 'function' ? updater(expandedRef.current) : updater
    if (controlledExpanded === undefined) setInternalExpanded(next)
    const emit = onExpandedChangeRef.current
    if (emit) {
      if (next === true) {
        const record: Record<string, boolean> = {}
        for (const row of tableRef.current?.getPreExpandedRowModel().flatRows ?? []) {
          if (row.subRows.length > 0) record[row.id] = true
        }
        emit(record)
      } else {
        emit(next)
      }
    }
    // controlledExpanded is read via expandedRef; stable callback is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledExpanded === undefined])

  // ----- Columns (selection injection) -----

  // Foreign columns referenced by the shared sort that this tab doesn't render,
  // normalized to hidden sort-only columns. They let the engine order rows by a
  // column owned by another tab; they're forced invisible below so they never
  // reach rendering, the frozen-pane split, auto widths, the picker, or footer.
  const sortOnlyLeafColumns = useMemo<ColumnDef<TRow, unknown>[]>(() => {
    if (!sortOnlyColumns || sortOnlyColumns.length === 0) return []
    const own = new Set(columns.map((c) => getColumnId(c)).filter(Boolean))
    const seen = new Set<string>()
    const out: ColumnDef<TRow, unknown>[] = []
    for (const col of sortOnlyColumns) {
      const id = getColumnId(col)
      if (!id || own.has(id) || seen.has(id)) continue
      seen.add(id)
      out.push(toSortOnlyColumn(col, id))
    }
    return out
  }, [sortOnlyColumns, columns])

  const effectiveColumns = useMemo<ColumnDef<TRow, unknown>[]>(() => {
    if (!enableRowSelection) return [...columns, ...sortOnlyLeafColumns]
    const selectionColumn: ColumnDef<TRow, unknown> = {
      id: SELECTION_COLUMN_ID,
      header: ({ table }) => {
        const filteredRows = table.getFilteredRowModel().flatRows
        const allSelected = filteredRows.length > 0 && filteredRows.every((r) => r.getIsSelected())
        const someSelected =
          !allSelected && filteredRows.some((r) => r.getIsSelected() || r.getIsSomeSelected())
        return (
          <Checkbox
            aria-label="Select all rows"
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            disabled={isSubmitting}
            onCheckedChange={(value) => {
              table.setRowSelection((prev) => {
                const next = { ...prev }
                for (const r of filteredRows) {
                  if (value === true) next[r.id] = true
                  else delete next[r.id]
                }
                return next
              })
            }}
          />
        )
      },
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected() ? true : row.getIsSomeSelected() ? 'indeterminate' : false}
          disabled={!row.getCanSelect() || isSubmitting}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onCheckedChange={(value) => row.toggleSelected(value === true)}
        />
      ),
      enableSorting: false,
      enableColumnFilter: false,
      enableHiding: false,
      enableResizing: false,
    }
    return [selectionColumn, ...columns, ...sortOnlyLeafColumns]
  }, [columns, sortOnlyLeafColumns, enableRowSelection, isSubmitting])

  // Sorting is fully shared across tabs: a sort by any column reorders rows on
  // every tab, since all tabs are views over one dataset. Columns this tab
  // doesn't render but the shared sort references are supplied as hidden
  // sort-only columns (see effectiveColumns), so the engine can order by them
  // without warning. We still drop any entry whose column is genuinely unknown
  // here (neither rendered nor sort-only) so TanStack never warns.
  const effectiveSorting = useMemo(() => {
    const ids = new Set(
      effectiveColumns
        .map((c) => c.id ?? (c as { accessorKey?: unknown }).accessorKey)
        .filter((id): id is string => typeof id === 'string'),
    )
    return sorting.every((s) => ids.has(s.id)) ? sorting : sorting.filter((s) => ids.has(s.id))
  }, [effectiveColumns, sorting])

  // Sort-only columns are forced hidden so they participate only in sorting,
  // never in the visible/rendered columns, the frozen-pane split, auto widths,
  // the visibility picker, or footer aggregates.
  const effectiveVisibility = useMemo<VisibilityState>(() => {
    if (sortOnlyLeafColumns.length === 0) return visibility
    const next: VisibilityState = { ...visibility }
    for (const col of sortOnlyLeafColumns) next[getColumnId(col)] = false
    return next
  }, [visibility, sortOnlyLeafColumns])

  // ----- Table instance -----

  const getRowIdString = useCallback((row: TRow) => String(getRowId(row)), [getRowId])

  const table = useReactTable<TRow>({
    data,
    columns: effectiveColumns,
    state: {
      sorting: effectiveSorting,
      columnFilters: filters,
      columnVisibility: effectiveVisibility,
      rowSelection,
      expanded: enableExpanding ? expandedState : {},
    },
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: handleFiltersChange,
    onColumnVisibilityChange: handleVisibilityChange,
    onRowSelectionChange: handleRowSelectionChange,
    onExpandedChange: handleExpandedChange,
    getRowId: getRowIdString,
    getSubRows: enableExpanding ? getSubRows : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    filterFromLeafRows: true,
    enableMultiSort,
    isMultiSortEvent: (e) => (e as React.MouseEvent).shiftKey,
    enableRowSelection,
    enableSubRowSelection: true,
    autoResetExpanded: false,
    defaultColumn: { filterFn: tgxFilterFn as unknown as import('@tanstack/react-table').FilterFn<TRow> },
  })
  tableRef.current = table

  // ----- Auto + manual column widths -----

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const autoWidths = useAutoColumnWidths(
    {
      columns,
      data,
      getSubRows,
      enableExpanding,
      measure,
      includeHeaderInAutosize,
    },
    scrollRef,
  )
  const [manualWidths, setManualWidths] = useState<Record<string, number>>({})
  /** After the user resizes any pinned (non-selection) column, stop shrinking sibling pinned autos to hold total at 50% — otherwise the pane stays capped until one manual column alone reaches half the viewport. */
  const [pinnedUserSized, setPinnedUserSized] = useState(false)
  const pinnedColumnIdsRef = useRef<Set<string>>(new Set())

  const widthOf = useCallback(
    (columnId: string): number => {
      if (columnId === SELECTION_COLUMN_ID) return SELECTION_COLUMN_WIDTH_PX
      return manualWidths[columnId] ?? autoWidths?.get(columnId) ?? MIN_COLUMN_WIDTH_PX
    },
    [manualWidths, autoWidths],
  )

  // ----- Pane split + viewport tracking -----

  const [viewportWidth, setViewportWidth] = useState(0)

  useIsomorphicLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setViewportWidth(el.clientWidth)
    })
    observer.observe(el)
    setViewportWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [isLoading])

  const visibleLeafColumns = table.getVisibleLeafColumns()
  const visibleLeafColumnsRef = useRef<Column<TRow, unknown>[]>(visibleLeafColumns)
  visibleLeafColumnsRef.current = visibleLeafColumns

  // Pinning is by column *identity*, not position: the frozen pane is the
  // visible intersection of the canonical frozen id set (selection column plus
  // the first N data leaf columns), so hiding a frozen column shrinks the pane
  // without promoting the next scrollable column into it.
  const frozenColumnIds = useMemo(() => {
    const ids = new Set<string>()
    if (enableRowSelection) ids.add(SELECTION_COLUMN_ID)
    for (const col of table
      .getAllLeafColumns()
      .filter((c) => c.id !== SELECTION_COLUMN_ID)
      .slice(0, Math.max(0, frozenColumns))) {
      ids.add(col.id)
    }
    return ids
  }, [table, enableRowSelection, frozenColumns])
  const pinnedColumns = visibleLeafColumns.filter((c) => frozenColumnIds.has(c.id))
  const scrollColumns = visibleLeafColumns.filter((c) => !frozenColumnIds.has(c.id))
  // The canonical frozen set is a prefix of the column order, so visible pinned
  // columns remain contiguous at the front of visibleLeafColumns.
  const pinnedCount = pinnedColumns.length

  pinnedColumnIdsRef.current = new Set(pinnedColumns.map((c) => c.id))

  // Cap only auto-sized pinned width at FROZEN_PANE_MAX_FRACTION of the viewport.
  // After the user resizes any pinned data column, sibling pinned autos are no
  // longer scaled down to keep the pane at that cap (see pinnedUserSized).
  const { pinnedWidth, flexScale } = useMemo(() => {
    if (pinnedUserSized) {
      const w = pinnedColumns.reduce((sum, col) => sum + widthOf(col.id), 0)
      return { pinnedWidth: w, flexScale: 1 }
    }
    const pinnedCap =
      viewportWidth > 0 ? viewportWidth * FROZEN_PANE_MAX_FRACTION : Infinity
    let fixedSum = 0
    let flexRawSum = 0
    for (const col of pinnedColumns) {
      const id = col.id
      const manualPinned = id !== SELECTION_COLUMN_ID && Object.hasOwn(manualWidths, id)
      if (manualPinned) {
        fixedSum += manualWidths[id] ?? MIN_COLUMN_WIDTH_PX
      } else if (id === SELECTION_COLUMN_ID) {
        flexRawSum += SELECTION_COLUMN_WIDTH_PX
      } else {
        flexRawSum += autoWidths?.get(id) ?? MIN_COLUMN_WIDTH_PX
      }
    }
    let flexScale = 1
    if (viewportWidth > 0 && flexRawSum > 0) {
      if (fixedSum >= pinnedCap) {
        flexScale = 1
      } else {
        const budget = pinnedCap - fixedSum
        if (flexRawSum > budget) {
          flexScale = budget / flexRawSum
        }
      }
    }
    return { pinnedWidth: fixedSum + flexRawSum * flexScale, flexScale }
  }, [pinnedUserSized, pinnedColumns, manualWidths, autoWidths, viewportWidth, widthOf])

  const pinnedWidthOf = useCallback(
    (columnId: string): number => {
      if (pinnedUserSized) {
        return widthOf(columnId)
      }
      if (columnId === SELECTION_COLUMN_ID) {
        return SELECTION_COLUMN_WIDTH_PX * flexScale
      }
      if (Object.hasOwn(manualWidths, columnId)) {
        return manualWidths[columnId] ?? MIN_COLUMN_WIDTH_PX
      }
      return (autoWidths?.get(columnId) ?? MIN_COLUMN_WIDTH_PX) * flexScale
    },
    [pinnedUserSized, widthOf, manualWidths, autoWidths, flexScale],
  )

  // Keyed by ids (not array identity) so widths stay referentially stable
  // across re-renders and the column-virtualization hook doesn't churn.
  const scrollColumnIdsKey = scrollColumns.map((c) => c.id).join('\u0000')
  // Full visible set (pinned + scroll) — invalidates memoized rows when
  // column visibility changes.
  const visibleColumnIdsKey =
    pinnedColumns.map((c) => c.id).join('\u0000') + '\u0001' + scrollColumnIdsKey
  const scrollWidths = useMemo(
    () =>
      scrollColumnIdsKey === ''
        ? []
        : scrollColumnIdsKey.split('\u0000').map((id) => widthOf(id)),
    [scrollColumnIdsKey, widthOf],
  )

  const getScrollLeft = useCallback(() => scrollRef.current?.scrollLeft ?? 0, [])
  const paneWidth = Math.max(0, viewportWidth - pinnedWidth)
  const {
    range: colRange,
    offsets: colOffsets,
    totalWidth: scrollTotalWidth,
    onScroll: onHorizontalScroll,
  } = useColumnVirtualization(scrollWidths, paneWidth, getScrollLeft)

  const contentWidth = pinnedWidth + scrollTotalWidth

  // ----- Rows + row virtualization -----

  const rows = table.getRowModel().rows
  const headerOffset = HEADER_HEIGHT_PX + (columnGroups ? GROUP_HEADER_HEIGHT_PX : 0)

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: ROW_OVERSCAN,
    getItemKey: (index) => rows[index]?.id ?? index,
    scrollMargin: headerOffset,
  })

  // ----- Editing -----
  //
  // All editing callbacks read changing values through refs so their identity
  // is stable — required for the memoized rows to skip re-renders on scroll.

  const [editing, setEditing] = useState<EditingState>(null)
  const [savePending, setSavePending] = useState(false)
  const editorsDisabled = savePending || isSubmitting

  const editableColumnIdsRef = useRef(editableColumnIds)
  editableColumnIdsRef.current = editableColumnIds
  const onSaveEditRef = useRef(onSaveEdit)
  onSaveEditRef.current = onSaveEdit
  const savePendingRef = useRef(savePending)
  savePendingRef.current = savePending
  const isSubmittingRef = useRef(isSubmitting)
  isSubmittingRef.current = isSubmitting

  const canEditColumn = useCallback(
    (columnId: string, meta: { editable?: boolean } | undefined): boolean => {
      if (!editable) return false
      if (meta?.editable !== true) return false
      return editableColumnIdsRef.current?.includes(columnId) ?? false
    },
    [editable],
  )

  const findAdjacentEditable = useCallback(
    (columnId: string, nav: EditNavigation): string | null => {
      const editableCols = visibleLeafColumnsRef.current.filter(
        (col) => col.id !== SELECTION_COLUMN_ID && canEditColumn(col.id, col.columnDef.meta),
      )
      const index = editableCols.findIndex((col) => col.id === columnId)
      if (index === -1) return null
      const target = editableCols[nav === 'next' ? index + 1 : index - 1]
      return target?.id ?? null
    },
    [canEditColumn],
  )

  const beginEdit = useCallback((cell: Cell<TRow, unknown>) => {
    setEditing({
      rowId: cell.row.id,
      columnId: cell.column.id,
      initialValue: getCellEditValue(cell.row.original, cell.column.id),
    })
  }, [])

  const cancelEdit = useCallback(() => setEditing(null), [])

  const commitEdit = useCallback(
    (row: Row<TRow>, columnId: string, value: string | number | boolean, nav?: EditNavigation) => {
      void (async () => {
        const moveOrClose = () => {
          if (nav) {
            const targetId = findAdjacentEditable(columnId, nav)
            if (targetId) {
              setEditing({
                rowId: row.id,
                columnId: targetId,
                initialValue: getCellEditValue(row.original, targetId),
              })
              return
            }
          }
          setEditing(null)
        }

        const initial = getCellEditValue(row.original, columnId)
        if (String(value) === initial) {
          moveOrClose()
          return
        }
        const save = onSaveEditRef.current
        if (!save) {
          setEditing(null)
          return
        }
        setSavePending(true)
        let ok = false
        try {
          ok = await save(row.original, columnId, value)
        } catch {
          ok = false
        } finally {
          setSavePending(false)
        }
        if (ok) moveOrClose()
        else {
          // Keep the editor open so the user can correct the value.
          setEditing({ rowId: row.id, columnId, initialValue: initial })
        }
      })()
    },
    [findAdjacentEditable],
  )

  const commitEditForCell = useCallback(
    (cell: Cell<TRow, unknown>, value: string | number | boolean, nav?: EditNavigation) =>
      commitEdit(cell.row, cell.column.id, value, nav),
    [commitEdit],
  )

  const directBooleanSave = useCallback((cell: Cell<TRow, unknown>, value: boolean) => {
    const save = onSaveEditRef.current
    if (!save || savePendingRef.current || isSubmittingRef.current) return
    void (async () => {
      setSavePending(true)
      try {
        await save(cell.row.original, cell.column.id, value)
      } finally {
        setSavePending(false)
      }
    })()
  }, [])

  // ----- Auto-expand parents revealed by descendant filter matches (spec §19.5) -----

  useEffect(() => {
    if (!enableExpanding || filters.length === 0) return
    if (expandedRef.current === true) return
    const activeFilters = filters.filter((f) => !isEmptyFilterValue(f.value))
    if (activeFilters.length === 0) return
    const toExpand: Record<string, boolean> = {}
    for (const row of table.getFilteredRowModel().flatRows) {
      if (row.subRows.length === 0) continue
      const matchesItself = activeFilters.every((f) => {
        try {
          return matchesFilterValue(row.getValue(f.id), f.value as ColumnFilterValue)
        } catch {
          return true
        }
      })
      if (!matchesItself && !row.getIsExpanded()) toExpand[row.id] = true
    }
    if (Object.keys(toExpand).length > 0) {
      handleExpandedChange((prev) =>
        prev === true ? true : { ...(prev as Record<string, boolean>), ...toExpand },
      )
    }
  }, [enableExpanding, filters, table, handleExpandedChange])

  // ----- Footer aggregates (over currently-filtered leaf rows, spec §16/§19.7) -----

  const filteredRowModel = table.getFilteredRowModel()
  const footerValues = useMemo(() => {
    const map = new Map<string, string>()
    if (!enableFooter) return map
    const leaves = filteredRowModel.flatRows.filter((r) => r.subRows.length === 0)
    for (const col of visibleLeafColumns) {
      const meta = col.columnDef.meta
      if (!meta?.footerAggregate) continue
      const computed = computeAggregate(
        meta.footerAggregate,
        leaves.map((r) => r.getValue(col.id)),
      )
      if (computed !== null) map.set(col.id, formatAggregate(computed, meta.footerFormat))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableFooter, filteredRowModel, scrollColumnIdsKey, pinnedCount])

  // ----- Record count (opt-in; filtered leaf rows vs. total, spec parity with footer) -----

  const recordCounts = useMemo(() => {
    if (!enableRecordCount) return null
    const filtered = filteredRowModel.flatRows.filter((r) => r.subRows.length === 0).length
    const total = table
      .getCoreRowModel()
      .flatRows.filter((r) => r.subRows.length === 0).length
    return { filtered, total, isFiltered: filtered < total }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableRecordCount, filteredRowModel, data])

  const recordCountContent = useMemo<React.ReactNode>(
    () => (recordCounts ? formatRecordCount(recordCounts, recordCountLabel) : null),
    [recordCounts, recordCountLabel],
  )

  // Report the computed counts up so a tab strip can render them in its own
  // chrome (top placement in the tabbed shells) instead of a separate toolbar
  // row. Keyed on the primitive values so a new filtered-row-model reference
  // from an unrelated change (e.g. sorting) doesn't churn the consumer.
  useEffect(() => {
    onRecordCountChange?.(recordCounts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRecordCountChange, recordCounts?.filtered, recordCounts?.total, recordCounts?.isFiltered])

  const showTopRecordCount =
    recordCounts !== null && recordCountPosition === 'top' && recordCountInToolbar
  const showBottomRecordCount = recordCounts !== null && recordCountPosition === 'bottom'

  // ----- Filter badges -----

  const badgeItems = useMemo<FilterBadgeItem[]>(() => {
    if (hideFilterBadges) return []
    return filters
      .filter((f) => !isEmptyFilterValue(f.value))
      .map((f) => {
        const column = table.getColumn(f.id)
        const label = column
          ? headerLabelOf(column.columnDef as ColumnDef<TRow, unknown>, f.id, columnLabel)
          : f.id
        return {
          key: f.id,
          label: `${label}: ${describeFilterValue(f.value as ColumnFilterValue)}`,
          onClear: () => column?.setFilterValue(undefined),
        }
      })
  }, [filters, table, columnLabel, hideFilterBadges])

  // ----- Column visibility picker items (spec §12 exclusions) -----

  const pickerItems = useMemo(() => {
    if (!enableColumnVisibility || hideBuiltInPicker || columnGroups) return []
    // Frozen columns are listed alongside scrollable ones; only the selection
    // column and columns with hiding disabled are excluded.
    return table
      .getAllLeafColumns()
      .filter((col) => col.id !== SELECTION_COLUMN_ID && col.getCanHide())
      .map((col) => ({
        id: col.id,
        label: headerLabelOf(col.columnDef as ColumnDef<TRow, unknown>, col.id, columnLabel),
        visible: col.getIsVisible(),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableColumnVisibility, hideBuiltInPicker, columnGroups, table, columnLabel, visibility])

  // ----- Group header segments (spec §12: recomputed colspans) -----

  const groupSegments = useMemo(() => {
    if (!columnGroups) return null
    const groupByColumn = new Map<string, ColumnGroupDef>()
    for (const group of columnGroups) {
      for (const id of group.columnIds) groupByColumn.set(id, group)
    }
    const build = (cols: typeof visibleLeafColumns, scaled: boolean) => {
      const segments: { key: string; label: string; width: number }[] = []
      for (const col of cols) {
        const group = col.id === SELECTION_COLUMN_ID ? undefined : groupByColumn.get(col.id)
        const width = scaled ? pinnedWidthOf(col.id) : widthOf(col.id)
        const last = segments[segments.length - 1]
        const key = group?.id ?? `__ungrouped_${col.id}`
        if (last && group && last.key === group.id) {
          last.width += width
        } else {
          segments.push({ key, label: group?.label ?? '', width })
        }
      }
      return segments
    }
    return {
      pinned: build(pinnedColumns, true),
      scroll: build(scrollColumns, false),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnGroups, scrollColumnIdsKey, pinnedCount, widthOf, pinnedWidthOf])

  // ----- Render helpers -----

  const expandColumnId = useMemo(() => {
    if (!enableExpanding) return null
    return visibleLeafColumns.find((c) => c.id !== SELECTION_COLUMN_ID)?.id ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableExpanding, scrollColumnIdsKey, pinnedCount])

  const headerGroup = table.getHeaderGroups()[0]
  const sortedCount = effectiveSorting.length

  // Stable column-keyed callbacks so the memoized header cells only re-render
  // when their own sort/filter/width state changes.
  const getUniqueValuesFor = useCallback((column: Column<TRow, unknown>) => {
    const set = new Set<string>()
    for (const key of column.getFacetedUniqueValues().keys()) {
      set.add(String(key ?? ''))
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [])

  const handleFilterChange = useCallback(
    (column: Column<TRow, unknown>, next: ColumnFilterValue | undefined) =>
      column.setFilterValue(next),
    [],
  )

  const handleResize = useCallback((columnId: string, w: number) => {
    setManualWidths((prev) => ({ ...prev, [columnId]: w }))
    if (columnId !== SELECTION_COLUMN_ID && pinnedColumnIdsRef.current.has(columnId)) {
      setPinnedUserSized(true)
    }
  }, [])

  const renderHeaderCell = (columnIndex: number, scaled: boolean) => {
    const header = headerGroup?.headers[columnIndex]
    if (!header) return null
    const column = header.column
    const width = scaled ? pinnedWidthOf(column.id) : widthOf(column.id)
    if (column.id === SELECTION_COLUMN_ID) {
      return (
        <div
          key={column.id}
          className={cn('flex shrink-0 items-center justify-center', classNames?.headerCell)}
          style={{ width, height: HEADER_HEIGHT_PX }}
        >
          {flexRender(column.columnDef.header, header.getContext())}
        </div>
      )
    }
    const filterValue = filters.find((f) => f.id === column.id)?.value as
      | ColumnFilterValue
      | undefined
    return (
      <HeaderCell
        key={column.id}
        header={header}
        width={width}
        sorted={column.getIsSorted()}
        sortIndex={column.getSortIndex()}
        sortedCount={sortedCount}
        columnLabel={headerLabelOf(
          column.columnDef as ColumnDef<TRow, unknown>,
          column.id,
          columnLabel,
        )}
        filterable={column.columnDef.enableColumnFilter === true}
        filterValue={filterValue}
        getUniqueValues={getUniqueValuesFor}
        onFilterChange={handleFilterChange}
        canResize={column.getCanResize()}
        onResize={handleResize}
        className={classNames?.headerCell}
      />
    )
  }

  const renderFooterCell = (columnId: string, scaled: boolean) => {
    const column = table.getColumn(columnId)
    const meta = column?.columnDef.meta
    const width = scaled ? pinnedWidthOf(columnId) : widthOf(columnId)
    const content = footerValues.get(columnId) ?? meta?.footerLabel ?? ''
    return (
      <div
        key={columnId}
        className={cn(
          'flex shrink-0 items-center overflow-hidden px-3 text-sm font-medium',
          classNames?.footerCell,
        )}
        style={{ width, height: FOOTER_HEIGHT_PX }}
      >
        <span className="truncate">{content}</span>
      </div>
    )
  }

  // Chunk-aligned column window. Body cells render in CHUNK_COLUMNS-sized
  // chunks so sliding the window reuses memoized chunks; header and footer
  // render the same aligned window so they reveal in lockstep with the body.
  const hasScrollWindow = colRange.end >= colRange.start
  const chunkFrom = hasScrollWindow ? Math.floor(colRange.start / CHUNK_COLUMNS) : 0
  const chunkTo = hasScrollWindow ? Math.floor(colRange.end / CHUNK_COLUMNS) : -1
  const visibleScrollStart = chunkFrom * CHUNK_COLUMNS
  const visibleScrollEnd = hasScrollWindow
    ? Math.min(scrollColumns.length - 1, chunkTo * CHUNK_COLUMNS + CHUNK_COLUMNS - 1)
    : -1
  const scrollCellsLeft = pinnedWidth + (colOffsets[visibleScrollStart] ?? 0)

  const chunkLeftOf = useCallback(
    (chunk: number) => pinnedWidth + (colOffsets[chunk * CHUNK_COLUMNS] ?? 0),
    [pinnedWidth, colOffsets],
  )

  // Right boundary line when the columns don't fill the viewport.
  const showRightEdge = viewportWidth > 0 && contentWidth < viewportWidth

  const hasToolbarRow =
    Boolean(toolbar) ||
    pickerItems.length > 0 ||
    (enableExpanding && !isLoading) ||
    showTopRecordCount

  const skeletonWidths = useMemo(() => {
    if (!isLoading) return []
    return visibleLeafColumns.slice(0, 12).map((c) => widthOf(c.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, scrollColumnIdsKey, pinnedCount, widthOf])

  // ----- Render -----

  return (
    <div
      data-tgx-table=""
      className={cn(
        'relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-card text-card-foreground',
        bordered && 'rounded-md border border-border',
        !maxHeight && 'flex-1',
        classNames?.root,
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {hasToolbarRow && (
        <div
          data-tgx-toolbar=""
          className={cn(
            'flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5',
            classNames?.toolbar,
          )}
        >
          {toolbar}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {enableExpanding && !isLoading && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.toggleAllRowsExpanded(true)}
                >
                  <ChevronsUpDownIcon className="mr-1 size-3.5" />
                  Expand all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.toggleAllRowsExpanded(false)}
                >
                  <ChevronsDownUpIcon className="mr-1 size-3.5" />
                  Collapse all
                </Button>
              </>
            )}
            {pickerItems.length > 0 && (
              <ColumnVisibilityPicker
                items={pickerItems}
                onToggle={(id, visible) => table.getColumn(id)?.toggleVisibility(visible)}
              />
            )}
            {showTopRecordCount && (
              <span
                data-tgx-record-count=""
                className={cn(RECORD_COUNT_CLASS, classNames?.recordCount)}
              >
                {recordCountContent}
              </span>
            )}
          </div>
        </div>
      )}

      {!hideFilterBadges && (
        <FilterBadges
          items={badgeItems}
          onClearAll={() => handleFiltersChange([])}
          className={classNames?.filterBadges}
        />
      )}

      <div
        ref={scrollRef}
        className="tgx-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-contain"
        onScroll={onHorizontalScroll}
      >
        {isLoading ? (
          loadingSkeleton !== undefined ? (
            typeof loadingSkeleton === 'function' ? (
              loadingSkeleton(skeletonWidths)
            ) : (
              loadingSkeleton
            )
          ) : (
            <TableSkeleton widths={skeletonWidths} className={classNames?.skeleton} />
          )
        ) : (
          <div className="relative" style={{ width: contentWidth, minWidth: '100%' }}>
            {/* --- Sticky header block --- */}
            <div data-tgx-header-block="" className="sticky top-0 z-20">
              {groupSegments && (
                <div
                  className="relative flex w-full border-b border-border bg-(--tgx-header-bg)"
                  style={{ height: GROUP_HEADER_HEIGHT_PX }}
                >
                  <motion.div
                    data-tgx-pinned=""
                    className="sticky left-0 z-30 flex h-full shrink-0 border-r border-border bg-(--tgx-header-bg)"
                    style={{ width: pinnedWidth, x: pinnedPaneX }}
                  >
                    {groupSegments.pinned.map((seg) => (
                      <div
                        key={seg.key}
                        className={cn(
                          'flex shrink-0 items-center justify-center truncate border-r border-border/50 px-2 text-xs font-semibold text-muted-foreground last:border-r-0',
                          classNames?.groupHeaderCell,
                        )}
                        style={{ width: seg.width }}
                      >
                        {seg.label}
                      </div>
                    ))}
                  </motion.div>
                  <div className="flex h-full">
                    {groupSegments.scroll.map((seg) => (
                      <div
                        key={seg.key}
                        className={cn(
                          'flex shrink-0 items-center justify-center truncate border-r border-border/50 px-2 text-xs font-semibold text-muted-foreground last:border-r-0',
                          classNames?.groupHeaderCell,
                        )}
                        style={{ width: seg.width }}
                      >
                        {seg.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div
                className={cn(
                  'relative flex w-full border-b border-border bg-(--tgx-header-bg)',
                  classNames?.headerRow,
                )}
                style={{ height: HEADER_HEIGHT_PX }}
              >
                {pinnedCount > 0 && (
                  <motion.div
                    data-tgx-pinned=""
                    className="sticky left-0 z-30 flex h-full shrink-0 border-r border-border bg-(--tgx-header-bg)"
                    style={{ width: pinnedWidth, x: pinnedPaneX }}
                  >
                    {pinnedColumns.map((_, i) => renderHeaderCell(i, true))}
                  </motion.div>
                )}
                {visibleScrollEnd >= visibleScrollStart && (
                  <div
                    className="absolute top-0 bottom-0 flex"
                    style={{ left: scrollCellsLeft }}
                  >
                    {scrollColumns
                      .slice(visibleScrollStart, visibleScrollEnd + 1)
                      .map((_, i) => renderHeaderCell(pinnedCount + visibleScrollStart + i, false))}
                  </div>
                )}
              </div>
            </div>

            {/* --- Body --- */}
            {rows.length === 0 ? (
              <div
                className={cn(
                  'sticky left-0 flex items-center justify-center p-10 text-sm text-muted-foreground',
                  classNames?.empty,
                )}
                style={{ width: viewportWidth || undefined }}
              >
                {emptyMessage}
              </div>
            ) : (
              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((vi) => {
                  const row = rows[vi.index]
                  if (!row) return null
                  return (
                    <VirtualRow<TRow>
                      key={row.id}
                      row={row}
                      top={vi.start - headerOffset}
                      pinnedCount={pinnedCount}
                      pinnedWidth={pinnedWidth}
                      chunkFrom={chunkFrom}
                      chunkTo={chunkTo}
                      chunkLeftOf={chunkLeftOf}
                      columnsKey={visibleColumnIdsKey}
                      widthOf={widthOf}
                      pinnedWidthOf={pinnedWidthOf}
                      expandColumnId={expandColumnId}
                      editing={editing !== null && editing.rowId === row.id ? editing : null}
                      editorsDisabled={editorsDisabled}
                      isSubmitting={isSubmitting}
                      singleClickEdit={singleClickEdit}
                      isSelected={row.getIsSelected()}
                      isSomeSelected={row.getIsSomeSelected()}
                      isExpanded={row.getIsExpanded()}
                      canEditColumn={canEditColumn}
                      onBeginEdit={beginEdit}
                      onCommitEdit={commitEditForCell}
                      onCancelEdit={cancelEdit}
                      onDirectBooleanSave={directBooleanSave}
                      getCellClassName={getCellClassName}
                      bodyRowClassName={classNames?.bodyRow}
                      bodyCellClassName={classNames?.bodyCell}
                      pinnedPaneX={pinnedPaneX}
                    />
                  )
                })}
              </div>
            )}

            {/* --- Footer --- */}
            {enableFooter && rows.length > 0 && (
              <div
                data-tgx-footer-row=""
                className={cn(
                  'sticky bottom-0 z-20 flex w-full border-t border-border bg-(--tgx-header-bg)',
                  classNames?.footerRow,
                )}
                style={{ height: FOOTER_HEIGHT_PX }}
              >
                {pinnedCount > 0 && (
                  <motion.div
                    data-tgx-pinned=""
                    className="sticky left-0 z-30 flex h-full shrink-0 border-r border-border bg-(--tgx-header-bg)"
                    style={{ width: pinnedWidth, x: pinnedPaneX }}
                  >
                    {pinnedColumns.map((col) => renderFooterCell(col.id, true))}
                  </motion.div>
                )}
                {visibleScrollEnd >= visibleScrollStart && (
                  <div
                    className="absolute top-0 bottom-0 flex"
                    style={{ left: scrollCellsLeft }}
                  >
                    {scrollColumns
                      .slice(visibleScrollStart, visibleScrollEnd + 1)
                      .map((col) => renderFooterCell(col.id, false))}
                  </div>
                )}
              </div>
            )}

            {/* Right boundary of the last column when columns don't fill the viewport */}
            {showRightEdge && (
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-border"
                style={{ left: contentWidth - 1 }}
              />
            )}
          </div>
        )}
      </div>

      {showBottomRecordCount && (
        <div
          data-tgx-record-count=""
          className={cn(
            'pointer-events-none absolute right-2 bottom-2 z-30 px-1 text-xs text-muted-foreground tabular-nums',
            classNames?.recordCount,
          )}
        >
          {recordCountContent}
        </div>
      )}
    </div>
  )
}
