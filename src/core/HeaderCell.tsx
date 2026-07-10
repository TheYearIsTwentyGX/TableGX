import type { Column, Header, SortDirection } from '@tanstack/react-table'
import { flexRender } from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import * as React from 'react'
import { useRef, useState } from 'react'
import {
  ABSOLUTE_MIN_COLUMN_WIDTH_PX,
  HEADER_H_PADDING_PX,
  HEADER_HEIGHT_PX,
  HEADER_ICON_GAP_PX,
} from '../constants'
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect'
import { cn } from '../lib/cn'
import type { ColumnFilterValue, TableRowData } from '../types'
import { FilterPopover } from './FilterPopover'

/**
 * True when a column lacks room for its header text and icon cluster side by
 * side, so the icons must overlay the text instead. Pure + exported for tests.
 * The text is never shrunk to make room — when it doesn't fit, the icons float.
 */
export function needsHeaderIconOverlay({
  columnWidth,
  textWidth,
  iconsWidth,
  padding = HEADER_H_PADDING_PX,
  gap = HEADER_ICON_GAP_PX,
}: {
  columnWidth: number
  textWidth: number
  iconsWidth: number
  padding?: number
  gap?: number
}): boolean {
  // No icons, or no text to overlay → nothing to float.
  if (iconsWidth <= 0 || textWidth <= 0) return false
  const available = columnWidth - padding
  return textWidth + gap + iconsWidth > available
}

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
  const hasIcons = canSort || filterable

  const dragState = useRef<{ startX: number; startWidth: number } | null>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const iconsRef = useRef<HTMLDivElement>(null)

  // Resize drags coalesce to one width commit per animation frame. Pointer
  // events can fire at 120–240Hz and every commit re-renders the whole grid
  // (all row/chunk memos key on the width function), so committing per event
  // makes dragging jank on wide tables.
  const pendingResizeRef = useRef<number | null>(null)
  const resizeRafRef = useRef<number | null>(null)
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize
  const scheduleResize = (next: number) => {
    pendingResizeRef.current = next
    if (resizeRafRef.current !== null) return
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = null
      const w = pendingResizeRef.current
      pendingResizeRef.current = null
      if (w !== null) onResizeRef.current(column.id, w)
    })
  }
  const flushResize = () => {
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current)
      resizeRafRef.current = null
    }
    const w = pendingResizeRef.current
    pendingResizeRef.current = null
    if (w !== null) onResizeRef.current(column.id, w)
  }
  React.useEffect(
    () => () => {
      if (resizeRafRef.current !== null) cancelAnimationFrame(resizeRafRef.current)
    },
    [],
  )

  // When the header text + icon cluster can't sit side by side, the icons float
  // over the text (an overlay) instead of being hidden or shrinking the text.
  // Measured from the rendered DOM so it reacts to the real text/icon widths;
  // icon widths are read from the affordance children so the overlay's own
  // padding never feeds back into the decision (which would make it sticky).
  const [overlay, setOverlay] = useState(false)
  useIsomorphicLayoutEffect(() => {
    const textEl = textRef.current
    const iconsEl = iconsRef.current
    if (!textEl || !iconsEl) {
      setOverlay(false)
      return
    }
    const sortEl = iconsEl.querySelector<HTMLElement>('[data-tgx-sort-affordance]')
    const filterEl = iconsEl.querySelector<HTMLElement>('[data-tgx-filter-affordance]')
    let iconsWidth = 0
    if (sortEl) iconsWidth += sortEl.offsetWidth
    if (filterEl) iconsWidth += filterEl.offsetWidth
    if (sortEl && filterEl) iconsWidth += HEADER_ICON_GAP_PX
    setOverlay(
      needsHeaderIconOverlay({ columnWidth: width, textWidth: textEl.scrollWidth, iconsWidth }),
    )
  }, [width, canSort, filterable, sorted, sortedCount, sortIndex])

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
      <span ref={textRef} className="truncate">
        {header.isPlaceholder
          ? null
          : flexRender(column.columnDef.header, header.getContext())}
      </span>

      {hasIcons && (
        <div
          ref={iconsRef}
          className={cn(
            'flex shrink-0 items-center gap-1',
            overlay
              ? 'absolute top-0 right-0 z-10 h-full rounded-l-md bg-card/80 pr-3 pl-2 backdrop-blur-sm supports-[backdrop-filter]:bg-card/65'
              : 'ml-auto',
          )}
        >
          {canSort && (
            <span data-tgx-sort-affordance className="flex shrink-0 items-center" aria-hidden>
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

          {filterable && (
            <span data-tgx-filter-affordance className="flex shrink-0 items-center">
              <FilterPopover
                columnLabel={columnLabel}
                value={filterValue}
                getUniqueValues={() => getUniqueValues(column)}
                onChange={(next) => onFilterChange(column, next)}
              />
            </span>
          )}
        </div>
      )}

      {canResize && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${columnLabel} column`}
          tabIndex={0}
          className="group/resize absolute top-0 right-0 z-20 flex h-full w-1.5 cursor-col-resize justify-end outline-none"
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
            scheduleResize(next)
          }}
          onPointerUp={(e) => {
            dragState.current = null
            flushResize()
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
