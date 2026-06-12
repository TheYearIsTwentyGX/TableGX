import type { ColumnDef } from '@tanstack/react-table'
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ABSOLUTE_MIN_COLUMN_WIDTH_PX,
  AUTO_WIDTH_SAFETY_MARGIN_PX,
  HEADER_ICON_GAP_PX,
  INDENT_STEP_PX,
  MAX_COLUMN_WIDTH_PX,
} from '../constants'
import {
  canMeasureText,
  CELL_FONT,
  fontFromElement,
  HEADER_FONT,
  measureTextWidth,
} from '../lib/measure'
import { flattenWithDepth } from '../lib/rows'
import type { MeasureTextFn, TableColumnMeta, TableRowData } from '../types'

/** Horizontal cell padding (px-3 each side). */
const CELL_H_PADDING_PX = 24
/** Allowance for the sort arrow (and multi-sort priority badge). */
const SORT_ICON_ALLOWANCE_PX = 24
/** Allowance for the filter affordance button. */
const FILTER_ICON_ALLOWANCE_PX = 28
/** Allowance for the nested-row disclosure chevron button. */
const EXPAND_TOGGLE_ALLOWANCE_PX = 28
/**
 * Upper bound for a plausible measured icon-affordance width. The affordances
 * are a couple of small icon buttons, so any reading larger than this is a
 * layout artifact — a zero-layout/SSR environment or a test that mocks
 * offsetWidth to a container-sized box — and is ignored so the fixed allowance
 * stands instead of exploding the column's header floor.
 */
const MAX_MEASURED_ICON_WIDTH_PX = 120
/** Checkbox glyph + gap used by boolean display cells. */
const BOOLEAN_CHECKBOX_ALLOWANCE_PX = 24

/** Bounded sample size for cell value measurement. */
const SAMPLE_LIMIT = 200
/** Bounded node count when scanning nested data for depth/sampling. */
const FLATTEN_LIMIT = 5000

type AnyColumnDef<TRow extends TableRowData> = ColumnDef<TRow, unknown> & {
  accessorKey?: string
  accessorFn?: (row: TRow, index: number) => unknown
}

export function getColumnId<TRow extends TableRowData>(col: ColumnDef<TRow, unknown>): string {
  const c = col as AnyColumnDef<TRow>
  return c.id ?? c.accessorKey ?? ''
}

function getColumnValue<TRow extends TableRowData>(
  col: AnyColumnDef<TRow>,
  row: TRow,
  index: number,
): unknown {
  if (col.accessorFn) return col.accessorFn(row, index)
  if (col.accessorKey) return row[col.accessorKey]
  return undefined
}

function sampleIndices(total: number): number[] {
  if (total <= SAMPLE_LIMIT) return Array.from({ length: total }, (_, i) => i)
  const indices: number[] = []
  const firstChunk = Math.floor(SAMPLE_LIMIT / 2)
  for (let i = 0; i < firstChunk; i++) indices.push(i)
  const remaining = SAMPLE_LIMIT - firstChunk
  const stride = (total - firstChunk) / remaining
  for (let i = 0; i < remaining; i++) {
    indices.push(Math.min(total - 1, Math.floor(firstChunk + i * stride)))
  }
  return indices
}

export type AutoWidthOptions<TRow extends TableRowData> = {
  columns: ColumnDef<TRow, unknown>[]
  data: TRow[]
  getSubRows?: (row: TRow) => TRow[] | undefined
  enableExpanding?: boolean
  measure?: MeasureTextFn
  /** Font shorthand for header label measurement; defaults to the SSR fallback stack. */
  headerFont?: string
  /** Font shorthand for cell value measurement; defaults to the SSR fallback stack. */
  cellFont?: string
  /**
   * When true (default) the header label + its sort/filter affordances floor
   * each column's width. When false, width is driven purely by data-cell
   * content (the header no longer acts as a width floor).
   */
  includeHeaderInAutosize?: boolean
  /** Measured sort-affordance width (incl. gap); falls back to the fixed allowance. */
  sortIconWidth?: number
  /** Measured filter-affordance width (incl. gap); falls back to the fixed allowance. */
  filterIconWidth?: number
}

/**
 * Computes the natural width of every column from header + sampled cell text
 * (spec §14). Pure and deterministic — exported for tests; the hook wraps it.
 */
export function computeAutoWidths<TRow extends TableRowData>({
  columns,
  data,
  getSubRows,
  enableExpanding,
  measure = measureTextWidth,
  headerFont = HEADER_FONT,
  cellFont = CELL_FONT,
  includeHeaderInAutosize = true,
  sortIconWidth = SORT_ICON_ALLOWANCE_PX,
  filterIconWidth = FILTER_ICON_ALLOWANCE_PX,
}: AutoWidthOptions<TRow>): Map<string, number> {
  const widths = new Map<string, number>()

  const flat = enableExpanding
    ? flattenWithDepth(data, getSubRows, FLATTEN_LIMIT)
    : data.map((row) => ({ row, depth: 0 }))
  const maxDepth = flat.reduce((acc, r) => Math.max(acc, r.depth), 0)
  const indices = sampleIndices(flat.length)

  const disclosureColumnId = enableExpanding && columns[0] ? getColumnId(columns[0]) : null

  for (const col of columns) {
    const c = col as AnyColumnDef<TRow>
    const id = getColumnId(col)
    const meta = (col.meta ?? {}) as TableColumnMeta

    // --- Header floor: the per-column minimum contributed by the header. ---
    // When includeHeaderInAutosize is false the header no longer floors the
    // width — only the hard ABSOLUTE_MIN survives so width is content-driven.
    const headerLabel = typeof col.header === 'string' ? col.header : ''
    let headerWidth = CELL_H_PADDING_PX
    if (headerLabel) headerWidth += measure(headerLabel, headerFont) + AUTO_WIDTH_SAFETY_MARGIN_PX
    if (col.enableSorting !== false) headerWidth += sortIconWidth
    if (col.enableColumnFilter === true) headerWidth += filterIconWidth
    headerWidth = Math.max(headerWidth, ABSOLUTE_MIN_COLUMN_WIDTH_PX)
    const headerFloor = includeHeaderInAutosize ? headerWidth : ABSOLUTE_MIN_COLUMN_WIDTH_PX

    // --- Content width. ---
    let contentWidth: number
    if (meta.fixedMeasureWidth !== undefined) {
      contentWidth = meta.fixedMeasureWidth + CELL_H_PADDING_PX
    } else if (meta.inputType === 'boolean' && !meta.measureText) {
      contentWidth =
        BOOLEAN_CHECKBOX_ALLOWANCE_PX +
        Math.max(measure('Yes', cellFont), measure('No', cellFont)) +
        CELL_H_PADDING_PX +
        AUTO_WIDTH_SAFETY_MARGIN_PX
    } else {
      let maxText = 0
      for (const index of indices) {
        const entry = flat[index]
        if (!entry) continue
        const text = meta.measureText
          ? meta.measureText(entry.row)
          : String(getColumnValue(c, entry.row, index) ?? '')
        if (!text) continue
        const w = measure(text, cellFont)
        if (w > maxText) maxText = w
      }
      contentWidth = maxText + CELL_H_PADDING_PX
      if (maxText > 0) contentWidth += AUTO_WIDTH_SAFETY_MARGIN_PX
    }

    if (id === disclosureColumnId) {
      contentWidth += EXPAND_TOGGLE_ALLOWANCE_PX + maxDepth * INDENT_STEP_PX
    }

    // Clamp to [header floor, meta.maxColumnWidth ?? system max]. The floor is
    // the header contribution (default) or the hard min (header excluded).
    const upper = Math.max(headerFloor, meta.maxColumnWidth ?? MAX_COLUMN_WIDTH_PX)
    const width = Math.min(Math.max(contentWidth, headerFloor), upper)
    widths.set(id, Math.ceil(width))
  }

  return widths
}

function mapsEqual(a: Map<string, number> | null, b: Map<string, number>): boolean {
  if (a === null || a.size !== b.size) return false
  for (const [k, v] of b) {
    if (a.get(k) !== v) return false
  }
  return true
}

type ResolvedHeaderMetrics = {
  headerFont: string
  cellFont: string
  sortIconWidth?: number
  filterIconWidth?: number
}

/**
 * Reads the font actually painted in the rendered header/body cells (so text is
 * measured in the consumer's inherited font, not the hardcoded SSR fallback)
 * and the real rendered widths of the sort/filter affordances, so the header
 * floor reflects the actual icons instead of fixed approximations. Icon widths
 * are left undefined when nothing is rendered yet (SSR/first paint or jsdom),
 * letting computeAutoWidths fall back to the fixed allowances.
 */
function resolveHeaderMetrics(container: HTMLElement | null): ResolvedHeaderMetrics {
  if (!container) return { headerFont: HEADER_FONT, cellFont: CELL_FONT }
  const measured = (selector: string): number | undefined => {
    const el = container.querySelector(selector) as HTMLElement | null
    const w = el?.offsetWidth ?? 0
    // Ignore non-layout (0) and implausibly large (artifact) readings; the
    // fixed allowance covers those cases.
    if (w <= 0 || w > MAX_MEASURED_ICON_WIDTH_PX) return undefined
    return w + HEADER_ICON_GAP_PX
  }
  return {
    headerFont: fontFromElement(container.querySelector('[data-tgx-header]'), HEADER_FONT),
    cellFont: fontFromElement(container.querySelector('[data-tgx-cell]'), CELL_FONT),
    sortIconWidth: measured('[data-tgx-sort-affordance]'),
    filterIconWidth: measured('[data-tgx-filter-affordance]'),
  }
}

/**
 * Pre-paint auto column widths. Widths resolve in a layout effect (before the
 * browser paints) so there is never a visible layout shift; during SSR the
 * caller falls back to MIN_COLUMN_WIDTH_PX. When `containerRef` is supplied the
 * measurement font is derived from the rendered cells, and widths recompute once
 * the document's fonts finish loading so late-swapped web fonts do not leave
 * stale, too-narrow columns.
 */
export function useAutoColumnWidths<TRow extends TableRowData>(
  options: AutoWidthOptions<TRow>,
  containerRef?: RefObject<HTMLElement | null>,
): Map<string, number> | null {
  const [autoWidths, setAutoWidths] = useState<Map<string, number> | null>(null)
  const latest = useRef(options)
  latest.current = options

  const columnsKey = options.columns.map(getColumnId).join('\u0000')

  const recompute = useCallback(() => {
    const opts = latest.current
    if (!opts.measure && !canMeasureText()) return
    const metrics = resolveHeaderMetrics(containerRef?.current ?? null)
    const next = computeAutoWidths({ ...opts, ...metrics })
    setAutoWidths((prev) => (mapsEqual(prev, next) ? prev : next))
  }, [containerRef])

  useLayoutEffect(() => {
    recompute()
  }, [
    recompute,
    options.data,
    columnsKey,
    options.enableExpanding,
    options.getSubRows,
    options.measure,
    options.includeHeaderInAutosize,
  ])

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return
    let cancelled = false
    document.fonts.ready.then(() => {
      if (!cancelled) recompute()
    })
    return () => {
      cancelled = true
    }
  }, [recompute, options.data, columnsKey])

  return autoWidths
}
