import type { ColumnDef } from '@tanstack/react-table'
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ABSOLUTE_MIN_COLUMN_WIDTH_PX,
  AUTO_WIDTH_SAFETY_MARGIN_PX,
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

    // --- Header width: the real per-column minimum. ---
    const headerLabel = typeof col.header === 'string' ? col.header : ''
    let headerWidth = CELL_H_PADDING_PX
    if (headerLabel) headerWidth += measure(headerLabel, headerFont) + AUTO_WIDTH_SAFETY_MARGIN_PX
    if (col.enableSorting !== false) headerWidth += SORT_ICON_ALLOWANCE_PX
    if (col.enableColumnFilter === true) headerWidth += FILTER_ICON_ALLOWANCE_PX
    headerWidth = Math.max(headerWidth, ABSOLUTE_MIN_COLUMN_WIDTH_PX)

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

    // Clamp to [measured header width, meta.maxColumnWidth ?? system max].
    const upper = Math.max(headerWidth, meta.maxColumnWidth ?? MAX_COLUMN_WIDTH_PX)
    const width = Math.min(Math.max(contentWidth, headerWidth), upper)
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

/**
 * Reads the font actually painted in the rendered header/body cells so text is
 * measured in the consumer's inherited font, not the hardcoded SSR fallback.
 */
function resolveFonts(container: HTMLElement | null): { headerFont: string; cellFont: string } {
  if (!container) return { headerFont: HEADER_FONT, cellFont: CELL_FONT }
  return {
    headerFont: fontFromElement(container.querySelector('[data-tgx-header]'), HEADER_FONT),
    cellFont: fontFromElement(container.querySelector('[data-tgx-cell]'), CELL_FONT),
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
    const fonts = resolveFonts(containerRef?.current ?? null)
    const next = computeAutoWidths({ ...opts, ...fonts })
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
