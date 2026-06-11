import type { Column, Header, SortDirection } from '@tanstack/react-table'
import { flexRender } from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import * as React from 'react'
import { useRef } from 'react'
import { ABSOLUTE_MIN_COLUMN_WIDTH_PX, HEADER_HEIGHT_PX } from '../constants'
import { cn } from '../lib/cn'
import type { ColumnFilterValue, TableRowData } from '../types'
import { FilterPopover } from './FilterPopover'

/** Below this width the filter icon is hidden (spec §10.3). */
const HIDE_FILTER_BELOW_PX = 56
/** Below this width the sort icon is hidden (spec §10.3). */
const HIDE_SORT_BELOW_PX = 100

export type HeaderCellProps<TRow extends TableRowData> = {
  header: Header<TRow, unknown>
  width: number
  /** Sort state passed explicitly (not read off the column) so React.memo invalidates. */
  sorted: false | SortDirection
  sortIndex: number
  /** Total number of sorted columns (priority badges render when > 1). */
  sortedCount: number
  columnLabel: string
  filterable: boolean
  filterValue: ColumnFilterValue | undefined
  /** Stable; invoked lazily while the popover is open. */
  getUniqueValues: (column: Column<TRow, unknown>) => string[]
  /** Stable column-keyed callbacks so memoized cells skip re-renders. */
  onFilterChange: (column: Column<TRow, unknown>, next: ColumnFilterValue | undefined) => void
  canResize: boolean
  onResize: (columnId: string, width: number) => void
  className?: string
}

function HeaderCellInner<TRow extends TableRowData>({
  header,
  width,
  sorted,
  sortIndex,
  sortedCount,
  columnLabel,
  filterable,
  filterValue,
  getUniqueValues,
  onFilterChange,
  canResize,
  onResize,
  className,
}: HeaderCellProps<TRow>) {
  const column = header.column
  const canSort = column.getCanSort()

  const dragState = useRef<{ startX: number; startWidth: number } | null>(null)

  const showSortIcon = canSort && width >= HIDE_SORT_BELOW_PX
  const showFilterIcon = filterable && width >= HIDE_FILTER_BELOW_PX

  const toggleSort = canSort ? column.getToggleSortingHandler() : undefined

  return (
    <div
      data-tgx-header={column.id}
      role={canSort ? 'button' : undefined}
      tabIndex={canSort ? 0 : undefined}
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
      className={cn(
        'relative flex shrink-0 items-center gap-1 overflow-hidden px-3 text-sm font-medium select-none',
        canSort && 'cursor-pointer transition-colors hover:text-foreground',
        sorted ? 'text-foreground' : 'text-muted-foreground',
        className,
      )}
      style={{ width, height: HEADER_HEIGHT_PX }}
      onClick={toggleSort}
      onKeyDown={(e) => {
        if (!canSort) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggleSort?.(e)
        }
      }}
    >
      <span className="truncate">
        {header.isPlaceholder
          ? null
          : flexRender(column.columnDef.header, header.getContext())}
      </span>

      {showSortIcon && (
        <span className="flex shrink-0 items-center" aria-hidden>
          {sorted === 'asc' ? (
            <ArrowUpIcon className="size-3.5" />
          ) : sorted === 'desc' ? (
            <ArrowDownIcon className="size-3.5" />
          ) : (
            <ChevronsUpDownIcon className="size-3.5 opacity-40" />
          )}
          {sorted && sortedCount > 1 && sortIndex >= 0 && (
            <span className="ml-0.5 rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary tabular-nums">
              {sortIndex + 1}
            </span>
          )}
        </span>
      )}

      {showFilterIcon && (
        <span className="ml-auto flex shrink-0 items-center">
          <FilterPopover
            columnLabel={columnLabel}
            value={filterValue}
            getUniqueValues={() => getUniqueValues(column)}
            onChange={(next) => onFilterChange(column, next)}
          />
        </span>
      )}

      {canResize && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${columnLabel} column`}
          tabIndex={0}
          className="group/resize absolute top-0 right-0 flex h-full w-1.5 cursor-col-resize justify-end outline-none"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            dragState.current = { startX: e.clientX, startWidth: width }
          }}
          onPointerMove={(e) => {
            const drag = dragState.current
            if (!drag) return
            const next = Math.max(
              ABSOLUTE_MIN_COLUMN_WIDTH_PX,
              drag.startWidth + (e.clientX - drag.startX),
            )
            onResize(column.id, next)
          }}
          onPointerUp={(e) => {
            dragState.current = null
            e.currentTarget.releasePointerCapture(e.pointerId)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault()
              e.stopPropagation()
              const delta = e.key === 'ArrowLeft' ? -8 : 8
              onResize(column.id, Math.max(ABSOLUTE_MIN_COLUMN_WIDTH_PX, width + delta))
            }
          }}
        >
          {/* Hairline by default (matches standard borders); widens + highlights on hover/focus. */}
          <span
            aria-hidden
            className="h-full w-px bg-border transition-all group-hover/resize:w-[3px] group-hover/resize:bg-primary group-focus-visible/resize:w-[3px] group-focus-visible/resize:bg-primary"
          />
        </div>
      )}
    </div>
  )
}

export const HeaderCell = React.memo(HeaderCellInner) as typeof HeaderCellInner
