import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ABSOLUTE_MIN_COLUMN_WIDTH_PX,
  AUTO_WIDTH_SAFETY_MARGIN_PX,
  INDENT_STEP_PX,
  MAX_COLUMN_WIDTH_PX,
} from '../src/constants'
import { computeAutoWidths, useAutoColumnWidths } from '../src/hooks/useAutoColumnWidths'
import type { ColumnDef } from '@tanstack/react-table'
import type { MeasureTextFn, TableRowData } from '../src/types'

// Deterministic stub: 8px per character regardless of font.
const measure: MeasureTextFn = (text) => text.length * 8

type Row = { id: string; name: string; tiny: string; big: string; children?: Row[] }

const data: Row[] = [
  { id: '1', name: 'Alpha', tiny: 'x', big: 'B'.repeat(200) },
  { id: '2', name: 'Beta Beta Beta', tiny: 'y', big: 'B' },
]

const col = (id: string, header: string, extra?: object): ColumnDef<Row, unknown> =>
  ({ id, header, accessorKey: id, ...extra }) as ColumnDef<Row, unknown>

describe('computeAutoWidths', () => {
  it('uses the larger of header and sampled content width', () => {
    const widths = computeAutoWidths<Row>({
      columns: [col('name', 'Name')],
      data,
      measure,
    })
    // Content "Beta Beta Beta" (14 chars * 8 = 112) + padding 24 + margin 4 = 140;
    // header "Name" (32) + padding 24 + sort allowance 24 + margin 4 = 84.
    expect(widths.get('name')).toBe(140)
  })

  it('clamps to maxColumnWidth but never below the header width', () => {
    const widths = computeAutoWidths<Row>({
      columns: [col('big', 'Big Column', { meta: { maxColumnWidth: 120 } })],
      data,
      measure,
    })
    // Header: "Big Column" 10*8 + padding 24 + sort 24 + margin 4 = 132 > maxColumnWidth →
    // the header width wins as the floor.
    expect(widths.get('big')).toBe(132)
  })

  it('clamps to the system max by default', () => {
    const widths = computeAutoWidths<Row>({
      columns: [col('big', 'B')],
      data,
      measure,
    })
    expect(widths.get('big')).toBe(MAX_COLUMN_WIDTH_PX)
  })

  it('honors fixedMeasureWidth and skips sampling', () => {
    const widths = computeAutoWidths<Row>({
      columns: [col('big', '', { enableSorting: false, meta: { fixedMeasureWidth: 96 } })],
      data,
      measure,
    })
    // 96 + padding 24 = 120 (header floor is ABSOLUTE_MIN = 48). No safety margin
    // is added to an explicit fixedMeasureWidth — the consumer sized it deliberately.
    expect(widths.get('big')).toBe(120)
  })

  it('enforces the absolute minimum for empty headers', () => {
    const widths = computeAutoWidths<Row>({
      columns: [col('tiny', '', { enableSorting: false })],
      data,
      measure,
    })
    expect(widths.get('tiny')!).toBeGreaterThanOrEqual(ABSOLUTE_MIN_COLUMN_WIDTH_PX)
  })

  it('honors meta.measureText over the accessor value', () => {
    const widths = computeAutoWidths<Row>({
      columns: [
        col('tiny', 'T', {
          enableSorting: false,
          meta: { measureText: (row: TableRowData) => `${row.tiny}-expanded-value` },
        }),
      ],
      data,
      measure,
    })
    // "y-expanded-value" = 16 chars * 8 = 128 + 24 padding + 4 margin = 156.
    expect(widths.get('tiny')).toBe(156)
  })

  it('adds disclosure + depth indent to the first column when expanding', () => {
    // Long names so the content width (not the header floor) drives the result.
    const nested: Row[] = [
      {
        id: '1',
        name: 'AAAAAAAAAAAA',
        tiny: 'x',
        big: 'b',
        children: [{ id: '1.1', name: 'AAAAAAAAAAAA', tiny: 'x', big: 'b' }],
      },
    ]
    const flat = computeAutoWidths<Row>({
      columns: [col('name', 'Name')],
      data: nested,
      measure,
    })
    const expanding = computeAutoWidths<Row>({
      columns: [col('name', 'Name')],
      data: nested,
      getSubRows: (r) => r.children,
      enableExpanding: true,
      measure,
    })
    expect(expanding.get('name')! - flat.get('name')!).toBe(28 + 1 * INDENT_STEP_PX)
  })

  it('adds the safety margin so the final glyph cannot clip', () => {
    const withMargin = computeAutoWidths<Row>({
      columns: [col('name', 'Name', { enableSorting: false })],
      data: [{ id: '1', name: 'Mar', tiny: 'x', big: 'b' }],
      measure,
    })
    // "Mar" 3*8 = 24 content vs "Name" 32 header (header wins) + 24 padding + 4 margin.
    expect(withMargin.get('name')).toBe(32 + 24 + AUTO_WIDTH_SAFETY_MARGIN_PX)
    // The margin is the only slack: removing it would leave exactly the measured width.
    expect(withMargin.get('name')! - AUTO_WIDTH_SAFETY_MARGIN_PX).toBe(56)
  })

  it('measures with the injected header/cell fonts', () => {
    const seen: string[] = []
    const tracking: MeasureTextFn = (text, font) => {
      seen.push(font)
      return text.length * 8
    }
    computeAutoWidths<Row>({
      columns: [col('name', 'Name')],
      data,
      measure: tracking,
      headerFont: 'header-font',
      cellFont: 'cell-font',
    })
    expect(seen).toContain('header-font')
    expect(seen).toContain('cell-font')
  })

  it('drops the header floor when includeHeaderInAutosize is false', () => {
    const longHeader = col('tiny', 'A Very Long Header Title') // 24 chars
    const withHeader = computeAutoWidths<Row>({ columns: [longHeader], data, measure })
    const withoutHeader = computeAutoWidths<Row>({
      columns: [longHeader],
      data,
      measure,
      includeHeaderInAutosize: false,
    })
    // include=true: pad 24 + 24*8=192 + margin 4 + sort 24 = 244 floors the column.
    expect(withHeader.get('tiny')).toBe(244)
    // include=false: header no longer floors → tiny content 'x'/'y' (8) + pad 24 +
    // margin 4 = 36, clamped up to the absolute minimum.
    expect(withoutHeader.get('tiny')).toBe(ABSOLUTE_MIN_COLUMN_WIDTH_PX)
  })

  it('sizes from data content (not the header) when the header is excluded', () => {
    const wide: Row[] = [{ id: '1', name: 'x', tiny: 'x', big: 'B'.repeat(20) }]
    const widths = computeAutoWidths<Row>({
      columns: [col('big', 'A Very Long Header Title', { enableSorting: false })],
      data: wide,
      measure,
      includeHeaderInAutosize: false,
    })
    // content "B"*20 = 160 + pad 24 + margin 4 = 188; the long header is ignored.
    expect(widths.get('big')).toBe(20 * 8 + 24 + AUTO_WIDTH_SAFETY_MARGIN_PX)
  })

  it('uses the provided sort/filter icon widths for the header floor', () => {
    const widths = computeAutoWidths<Row>({
      columns: [col('name', 'Name', { enableSorting: true, enableColumnFilter: true })],
      data,
      measure,
      sortIconWidth: 40,
      filterIconWidth: 50,
    })
    // header floor = pad 24 + "Name" 32 + margin 4 + sort 40 + filter 50 = 150,
    // which beats the content width "Beta Beta Beta" (112 + 24 + 4 = 140).
    expect(widths.get('name')).toBe(150)
  })
})

describe('useAutoColumnWidths', () => {
  it('recomputes widths after the document fonts finish loading', async () => {
    let resolveReady: () => void = () => {}
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve
    })
    const docFonts = document as unknown as { fonts?: unknown }
    const original = docFonts.fonts
    docFonts.fonts = { ready }

    let calls = 0
    const counting: MeasureTextFn = (text) => {
      calls += 1
      return text.length * 8
    }

    try {
      renderHook(() =>
        useAutoColumnWidths<Row>({ columns: [col('name', 'Name')], data, measure: counting }),
      )
      const afterMount = calls
      expect(afterMount).toBeGreaterThan(0)

      resolveReady()
      await waitFor(() => expect(calls).toBeGreaterThan(afterMount))
    } finally {
      docFonts.fonts = original
    }
  })
})
