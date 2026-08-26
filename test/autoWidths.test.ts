import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ABSOLUTE_MIN_COLUMN_WIDTH_PX,
  AUTO_WIDTH_SAFETY_MARGIN_PX,
  INDENT_STEP_PX,
  MAX_COLUMN_WIDTH_PX,
} from '../src/constants'
import {
  computeAutoWidths,
  computeHeaderFloors,
  useAutoColumnWidths,
} from '../src/hooks/useAutoColumnWidths'
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

/**
 * A column with a rendered (function/JSX) header instead of a string literal —
 * the shape that used to contribute no width at all. `accessorFn` returns '' so
 * the column has no content width and the header floor is what's under test.
 */
const fnCol = (id: string, extra?: object): ColumnDef<Row, unknown> =>
  ({ id, header: () => null, accessorFn: () => '', ...extra }) as ColumnDef<Row, unknown>

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

  it('honors meta.measureWidth over both measureText and fixedMeasureWidth', () => {
    const widths = computeAutoWidths<Row>({
      columns: [
        col('tiny', '', {
          enableSorting: false,
          meta: {
            measureWidth: () => 100,
            // Both lower-precedence hints would yield a different width.
            measureText: () => 'B'.repeat(50),
            fixedMeasureWidth: 300,
          },
        }),
      ],
      data,
      measure,
    })
    // measureWidth 100 + padding 24 = 124. No safety margin; the other two
    // sizing hints are ignored entirely.
    expect(widths.get('tiny')).toBe(124)
  })

  it('takes the max measureWidth across the sampled rows', () => {
    const widths = computeAutoWidths<Row>({
      columns: [
        col('tiny', '', {
          enableSorting: false,
          meta: { measureWidth: (row: TableRowData) => (row.id === '2' ? 200 : 50) },
        }),
      ],
      data,
      measure,
    })
    // Widest sampled row = 200 + padding 24 = 224.
    expect(widths.get('tiny')).toBe(224)
  })

  it('adds padding but no safety margin to measureWidth', () => {
    const widths = computeAutoWidths<Row>({
      columns: [
        col('tiny', '', { enableSorting: false, meta: { measureWidth: () => 96 } }),
      ],
      data,
      measure,
    })
    // 96 + padding 24 = 120; the +4 text safety margin is NOT applied.
    expect(widths.get('tiny')).toBe(120)
    expect(widths.get('tiny')! - AUTO_WIDTH_SAFETY_MARGIN_PX).toBe(116)
  })

  it('clamps measureWidth to maxColumnWidth and the header floor', () => {
    const clamped = computeAutoWidths<Row>({
      columns: [
        col('tiny', '', {
          enableSorting: false,
          meta: { measureWidth: () => 1000, maxColumnWidth: 150 },
        }),
      ],
      data,
      measure,
    })
    // 1000 + 24 = 1024 content clamps down to maxColumnWidth 150.
    expect(clamped.get('tiny')).toBe(150)

    const floored = computeAutoWidths<Row>({
      columns: [col('name', 'A Very Long Header Title', { meta: { measureWidth: () => 10 } })],
      data,
      measure,
    })
    // content 10 + 24 = 34 is below the header floor (pad 24 + 24*8 header +
    // margin 4 + sort 24 = 244), so the header floor wins.
    expect(floored.get('name')).toBe(244)
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

  // --- Header label resolution for non-string headers (regression) ---
  //
  // A function/JSX header used to measure as '' — so an empty-bodied column
  // collapsed to padding + icons and its label was swallowed by the icon
  // overlay. Each case below pins one link of the resolution chain.

  it('floors a function header by the label read from the DOM', () => {
    const widths = computeAutoWidths<Row>({
      columns: [fnCol('Medicaid/Other', { enableColumnFilter: true })],
      data,
      measure,
      headerLabels: new Map([['Medicaid/Other', 'Medicaid/Other']]),
    })
    // pad 24 + "Medicaid/Other" 14*8=112 + margin 4 + sort 24 + filter 28 = 192;
    // the column's own cells are all empty (content width 24).
    expect(widths.get('Medicaid/Other')).toBe(192)
  })

  it('prefers meta.headerLabel over the label found in the DOM', () => {
    const widths = computeAutoWidths<Row>({
      columns: [fnCol('tiny', { meta: { headerLabel: 'Long Label' } })],
      data,
      measure,
      headerLabels: new Map([['tiny', 'x']]),
    })
    // pad 24 + "Long Label" 10*8=80 + margin 4 + sort 24 = 132.
    expect(widths.get('tiny')).toBe(132)
  })

  it("treats meta.headerLabel: '' as an opt-out for icon-only headers", () => {
    const widths = computeAutoWidths<Row>({
      columns: [fnCol('tiny', { enableColumnFilter: true, meta: { headerLabel: '' } })],
      data,
      measure,
      headerLabels: new Map([['tiny', 'Not This Label']]),
    })
    // No label reserved: pad 24 + sort 24 + filter 28 = 76.
    expect(widths.get('tiny')).toBe(76)
  })

  it('falls back to columnLabel, then to the column id', () => {
    const viaColumnLabel = computeAutoWidths<Row>({
      columns: [fnCol('tiny')],
      data,
      measure,
      columnLabel: () => 'Resolved',
    })
    // pad 24 + "Resolved" 8*8=64 + margin 4 + sort 24 = 116.
    expect(viaColumnLabel.get('tiny')).toBe(116)

    const viaId = computeAutoWidths<Row>({
      columns: [fnCol('Coinsurance')],
      data,
      measure,
    })
    // pad 24 + "Coinsurance" 11*8=88 + margin 4 + sort 24 = 140.
    expect(viaId.get('Coinsurance')).toBe(140)
  })

  it('reserves no label room for a column that renders no header', () => {
    const widths = computeAutoWidths<Row>({
      columns: [
        {
          id: 'Coinsurance',
          accessorFn: () => '',
          enableColumnFilter: true,
        } as unknown as ColumnDef<Row, unknown>,
      ],
      data,
      measure,
      columnLabel: () => 'A Very Long Label',
    })
    // Nothing is painted, so neither columnLabel nor the id is reserved:
    // pad 24 + sort 24 + filter 28 = 76.
    expect(widths.get('Coinsurance')).toBe(76)
  })

  it('keeps a string header authoritative over a stale DOM label', () => {
    const widths = computeAutoWidths<Row>({
      columns: [col('tiny', 'Name')],
      data,
      measure,
      headerLabels: new Map([['tiny', 'A Very Long Stale Label']]),
    })
    // pad 24 + "Name" 32 + margin 4 + sort 24 = 84 — the literal wins.
    expect(widths.get('tiny')).toBe(84)
  })
})

describe('computeHeaderFloors', () => {
  it('reports the same floor computeAutoWidths applies', () => {
    const options = {
      columns: [fnCol('Coinsurance', { enableColumnFilter: true }), col('name', 'Name')],
      data,
      measure,
    }
    const floors = computeHeaderFloors<Row>(options)
    // The empty-bodied column has no content width, so its width *is* its floor.
    expect(computeAutoWidths<Row>(options).get('Coinsurance')).toBe(floors.get('Coinsurance'))
    // pad 24 + "Name" 32 + margin 4 + sort 24 = 84, below the content width 140.
    expect(floors.get('name')).toBe(84)
  })

  it('ignores includeHeaderInAutosize — the floor is the header, always', () => {
    // The frozen pane clamps to these floors even when the header is not part
    // of the auto width, so a pinned label can never be scaled into clipping.
    const columns = [col('tiny', 'Name')]
    expect(
      computeHeaderFloors<Row>({ columns, data, measure, includeHeaderInAutosize: false }).get(
        'tiny',
      ),
    ).toBe(84)
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

  it('reads a rendered header label from the DOM and remembers it', () => {
    // A header the consumer renders as JSX: only the DOM knows its text.
    const container = document.createElement('div')
    container.innerHTML =
      '<div data-tgx-header="a"><span data-tgx-header-label="">Long Label Here</span></div>'
    document.body.appendChild(container)
    const containerRef = { current: container }

    try {
      const columns = [fnCol('a')]
      const { result, rerender } = renderHook(
        ({ rows }: { rows: Row[] }) =>
          useAutoColumnWidths<Row>({ columns, data: rows, measure }, containerRef),
        { initialProps: { rows: data } },
      )

      // pad 24 + "Long Label Here" 15*8=120 + margin 4 + sort 24 = 172. Without
      // the DOM read this column would float on its id: 24 + 8 + 4 + 24 = 60.
      expect(result.current?.widths.get('a')).toBe(172)
      expect(result.current?.headerFloors.get('a')).toBe(172)

      // Columns are horizontally virtualized, so a header can leave the DOM.
      // The label it already reported must survive, or a column's width would
      // depend on where the table happened to be scrolled when it remeasured.
      container.innerHTML = ''
      rerender({ rows: [...data] })
      expect(result.current?.widths.get('a')).toBe(172)
    } finally {
      container.remove()
    }
  })
})
