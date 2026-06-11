import type { ColumnDef } from '@tanstack/react-table'
import { useLayoutEffect, useRef, useState } from 'react'
import {
  ABSOLUTE_MIN_COLUMN_WIDTH_PX,
  INDENT_STEP_PX,
  MAX_COLUMN_WIDTH_PX,
} from '../constants'
import { canMeasureText, CELL_FONT, HEADER_FONT, measureTextWidth } from '../lib/measure'
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
    if (headerLabel) headerWidth += measure(headerLabel, HEADER_FONT)
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
        Math.max(measure('Yes', CELL_FONT), measure('No', CELL_FONT)) +
        CELL_H_PADDING_PX
    } else {
      let maxText = 0
      for (const index of indices) {
        const entry = flat[index]
        if (!entry) continue
        const text = meta.measureText
          ? meta.measureText(entry.row)
          : String(getColumnValue(c, entry.row, index) ?? '')
        if (!text) continue
        const w = measure(text, CELL_FONT)
        if (w > maxText) maxText = w
      }
      contentWidth = maxText + CELL_H_PADDING_PX
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
 * Pre-paint auto column widths. Widths resolve in a layout effect (before the
 * browser paints) so there is never a visible layout shift; during SSR the
 * caller falls back to MIN_COLUMN_WIDTH_PX.
 */
export function useAutoColumnWidths<TRow extends TableRowData>(
  options: AutoWidthOptions<TRow>,
): Map<string, number> | null {
  const [autoWidths, setAutoWidths] = useState<Map<string, number> | null>(null)
  const latest = useRef(options)
  latest.current = options

  const columnsKey = options.columns.map(getColumnId).join('\u0000')

  useLayoutEffect(() => {
    const opts = latest.current
    if (!opts.measure && !canMeasureText()) return
    const next = computeAutoWidths(opts)
    setAutoWidths((prev) => (mapsEqual(prev, next) ? prev : next))
  }, [options.data, columnsKey, options.enableExpanding, options.getSubRows, options.measure])

  return autoWidths
}
