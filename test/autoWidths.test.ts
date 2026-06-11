import { describe, expect, it } from 'vitest'
import {
  ABSOLUTE_MIN_COLUMN_WIDTH_PX,
  INDENT_STEP_PX,
  MAX_COLUMN_WIDTH_PX,
} from '../src/constants'
import { computeAutoWidths } from '../src/hooks/useAutoColumnWidths'
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
    // Content "Beta Beta Beta" (14 chars * 8 = 112) + padding 24 = 136;
    // header "Name" (32) + padding 24 + sort allowance 24 = 80.
    expect(widths.get('name')).toBe(136)
  })

  it('clamps to maxColumnWidth but never below the header width', () => {
    const widths = computeAutoWidths<Row>({
      columns: [col('big', 'Big Column', { meta: { maxColumnWidth: 120 } })],
      data,
      measure,
    })
    // Header: "Big Column" 10*8 + padding 24 + sort 24 = 128 > maxColumnWidth →
    // the header width wins as the floor.
    expect(widths.get('big')).toBe(128)
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
    // 96 + padding 24 = 120 (header floor is ABSOLUTE_MIN = 48).
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
    // "y-expanded-value" = 16 chars * 8 = 128 + 24 padding = 152.
    expect(widths.get('tiny')).toBe(152)
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
})
