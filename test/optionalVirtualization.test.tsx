import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { TabbedTable } from '../src/components/TabbedTable'
import { textColumn } from '../src/lib/columns'
import type { ColumnDef } from '@tanstack/react-table'
import type { PerfRow } from './perf/harness'
import type { TabbedTableTab } from '../src/types'
import {
  countRenderedRows,
  installJsdomViewport,
  makeDataset,
  perfMeasure,
  renderedColumnIds,
} from './perf/harness'
import {
  MAX_RENDERED_ROWS,
  VIEWPORT_HEIGHT_PX,
  VIEWPORT_WIDTH_PX,
} from './perf/thresholds'

// A grid big enough that, with virtualization ON, neither all rows nor all
// columns are ever in the DOM — so "all of them render" is a real signal that
// the flag turned virtualization off rather than the dataset just being small.
const ROW_COUNT = 120
const COL_COUNT = 40
const { data, columns } = makeDataset(ROW_COUNT, COL_COUNT)

let restoreViewport: (() => void) | null = null
afterEach(() => {
  restoreViewport?.()
  restoreViewport = null
})

function mountViewport() {
  restoreViewport = installJsdomViewport({
    width: VIEWPORT_WIDTH_PX,
    height: VIEWPORT_HEIGHT_PX,
  })
}

describe('optional row/column virtualization', () => {
  it('default: keeps a bounded row + column window (virtualization on)', () => {
    mountViewport()
    const { container } = render(
      <ReadOnlyTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
      />,
    )
    expect(countRenderedRows(container)).toBeLessThan(ROW_COUNT)
    expect(countRenderedRows(container)).toBeLessThanOrEqual(MAX_RENDERED_ROWS)
    expect(renderedColumnIds(container).size).toBeLessThan(COL_COUNT)
  })

  it('enableRowVirtualization=false: every row is in the DOM', () => {
    mountViewport()
    const { container } = render(
      <ReadOnlyTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
        enableRowVirtualization={false}
      />,
    )
    expect(countRenderedRows(container)).toBe(ROW_COUNT)
    // Columns still windowed (only the row flag was turned off).
    expect(renderedColumnIds(container).size).toBeLessThan(COL_COUNT)
  })

  it('enableColumnVirtualization=false: every scrollable column is in the DOM', () => {
    mountViewport()
    const { container } = render(
      <ReadOnlyTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
        enableColumnVirtualization={false}
      />,
    )
    expect(renderedColumnIds(container).size).toBe(COL_COUNT)
    // Rows still windowed (only the column flag was turned off).
    expect(countRenderedRows(container)).toBeLessThan(ROW_COUNT)
  })

  it('both flags off: the entire grid renders', () => {
    mountViewport()
    const { container } = render(
      <ReadOnlyTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
        enableRowVirtualization={false}
        enableColumnVirtualization={false}
      />,
    )
    expect(countRenderedRows(container)).toBe(ROW_COUNT)
    expect(renderedColumnIds(container).size).toBe(COL_COUNT)
  })

  it('TabbedTable forwards both flags to the active tab', () => {
    mountViewport()
    const tabs: TabbedTableTab<PerfRow>[] = [{ id: 'all', label: 'All', columns }]
    const { container } = render(
      <TabbedTable
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabs}
        defaultTabId="all"
        measure={perfMeasure}
        enableRowVirtualization={false}
        enableColumnVirtualization={false}
      />,
    )
    expect(countRenderedRows(container)).toBe(ROW_COUNT)
    expect(renderedColumnIds(container).size).toBe(COL_COUNT)
  })
})

function renderedRowEls(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-tgx-row]'))
}

describe('row height', () => {
  it('default (unset): rows + cells stay locked at the fixed 56px height', () => {
    mountViewport()
    const { container } = render(
      <ReadOnlyTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
      />,
    )
    const rows = renderedRowEls(container)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.style.height).toBe('56px')
      expect(row.style.minHeight).toBe('')
      // Default path never opts into measurement.
      expect(row.getAttribute('data-index')).toBeNull()
    }
    const cell = container.querySelector<HTMLElement>('[data-tgx-cell]')!
    expect(cell.style.height).toBe('56px')
    expect(cell.style.minHeight).toBe('')
  })

  it('rowHeight={number}: every rendered row + cell uses that fixed pixel height, no measurement', () => {
    mountViewport()
    const { container } = render(
      <ReadOnlyTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
        rowHeight={80}
      />,
    )
    const rows = renderedRowEls(container)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.style.height).toBe('80px')
      expect(row.style.minHeight).toBe('')
      expect(row.getAttribute('data-index')).toBeNull()
    }
    const cells = Array.from(container.querySelectorAll<HTMLElement>('[data-tgx-cell]'))
    for (const cell of cells) expect(cell.style.height).toBe('80px')
    // Still row-virtualized: a taller row height means even fewer rows fit.
    expect(countRenderedRows(container)).toBeLessThan(ROW_COUNT)
    expect(countRenderedRows(container)).toBeLessThanOrEqual(MAX_RENDERED_ROWS)
  })

  it('rowHeight={(row)=>n}: each row uses its own resolved pixel height', () => {
    mountViewport()
    const heightFor = (r: PerfRow) => (Number(r.id) % 2 === 0 ? 48 : 96)
    const { container } = render(
      <ReadOnlyTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
        rowHeight={heightFor}
      />,
    )
    const rows = renderedRowEls(container)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const id = row.getAttribute('data-tgx-row')!
      expect(row.style.height).toBe(`${heightFor({ id } as PerfRow)}px`)
    }
    const heights = new Set(rows.map((r) => r.style.height))
    expect(heights.has('48px')).toBe(true)
    expect(heights.has('96px')).toBe(true)
  })

  it("rowHeight='auto' (non-virtualized): content-driven height with a 56px floor; all columns render", () => {
    mountViewport()
    const { container } = render(
      <ReadOnlyTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
        rowHeight="auto"
        enableRowVirtualization={false}
      />,
    )
    const rows = renderedRowEls(container)
    expect(rows.length).toBe(ROW_COUNT)
    for (const row of rows) {
      // A min-height floor that content can grow past, not a locked height.
      expect(row.style.minHeight).toBe('56px')
      expect(row.style.height).toBe('')
    }
    // Auto renders every chunk in flow, so the full column set is in the DOM.
    expect(renderedColumnIds(container).size).toBe(COL_COUNT)
    const cell = container.querySelector<HTMLElement>('[data-tgx-cell]')!
    expect(cell.style.minHeight).toBe('56px')
    expect(cell.style.height).toBe('')
    // Top-aligned, wrapping cell (no single-line truncation).
    expect(cell.className).toContain('items-start')
  })

  it("rowHeight='auto' (virtualized): keeps a bounded row window and wires up measurement", () => {
    mountViewport()
    const { container } = render(
      <ReadOnlyTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
        rowHeight="auto"
      />,
    )
    // Row virtualization still bounds the DOM in auto mode.
    expect(countRenderedRows(container)).toBeGreaterThan(0)
    expect(countRenderedRows(container)).toBeLessThan(ROW_COUNT)
    expect(countRenderedRows(container)).toBeLessThanOrEqual(MAX_RENDERED_ROWS)
    const rows = renderedRowEls(container)
    for (const row of rows) {
      // Each rendered row is registered for TanStack height measurement.
      expect(row.getAttribute('data-index')).not.toBeNull()
      expect(row.style.minHeight).toBe('56px')
      expect(row.style.height).toBe('')
    }
    // Column virtualization is forced off in auto mode.
    expect(renderedColumnIds(container).size).toBe(COL_COUNT)
  })

  it('TabbedTable forwards rowHeight to the active tab', () => {
    mountViewport()
    const tabs: TabbedTableTab<PerfRow>[] = [{ id: 'all', label: 'All', columns }]
    const { container } = render(
      <TabbedTable
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabs}
        defaultTabId="all"
        measure={perfMeasure}
        rowHeight={72}
      />,
    )
    const rows = renderedRowEls(container)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.style.height).toBe('72px')
  })
})

// A paragraph long enough that, at any realistic column width, it wraps to
// several lines — pushing its cell (and therefore its row) past the 56px floor.
const TALL_TEXT = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(8)

type AlignRow = { id: string; pinned: string; scrollA: string; scrollB: string }

const ALIGN_COLUMNS: ColumnDef<AlignRow, unknown>[] = [
  textColumn<AlignRow>('pinned', 'Pinned'),
  textColumn<AlignRow>('scrollA', 'Scroll A'),
  textColumn<AlignRow>('scrollB', 'Scroll B'),
]

/** The rendered row element for a given row id. */
function rowById(root: ParentNode, id: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`[data-tgx-row="${id}"]`)
  if (!el) throw new Error(`no row rendered for id ${id}`)
  return el
}

/** Split a row's cells into its frozen-pane cells and its scroll-pane cells. */
function splitRowCells(row: HTMLElement): { pinned: HTMLElement[]; scroll: HTMLElement[] } {
  const pane = row.querySelector<HTMLElement>('[data-tgx-pinned]')
  if (!pane) throw new Error('row has no frozen pane')
  const all = Array.from(row.querySelectorAll<HTMLElement>('[data-tgx-cell]'))
  return {
    pinned: all.filter((c) => pane.contains(c)),
    scroll: all.filter((c) => !pane.contains(c)),
  }
}

describe('row height + frozen columns (auto-height alignment)', () => {
  // The data alternates which side carries the tall paragraph so a single
  // render exercises both "scroll cell drives the height" (row "scroll-tall")
  // and "pinned cell drives the height" (row "pinned-tall").
  const data: AlignRow[] = [
    { id: 'scroll-tall', pinned: 'short', scrollA: TALL_TEXT, scrollB: 'short' },
    { id: 'pinned-tall', pinned: TALL_TEXT, scrollA: 'short', scrollB: 'short' },
  ]

  function renderAligned() {
    mountViewport()
    return render(
      <ReadOnlyTable
        data={data}
        columns={ALIGN_COLUMNS}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
        frozenColumns={1}
        rowHeight="auto"
        enableRowVirtualization={false}
      />,
    )
  }

  it('keeps the frozen pane stretching with the row (h-full, no locked height)', () => {
    const { container } = renderAligned()
    for (const id of ['scroll-tall', 'pinned-tall']) {
      const row = rowById(container, id)
      // Row grows from a floor instead of being locked, so the taller pane wins.
      expect(row.style.minHeight).toBe('56px')
      expect(row.style.height).toBe('')
      const pane = row.querySelector<HTMLElement>('[data-tgx-pinned]')!
      // The pinned pane keeps h-full so flexbox stretches it to the row height.
      expect(pane.className).toContain('h-full')
      // Both panes live in the same flex row, so they cannot drift apart.
      const { pinned, scroll } = splitRowCells(row)
      expect(pinned.length).toBe(1)
      expect(scroll.length).toBe(2)
    }
  })

  it('a tall scroll cell and a tall pinned cell both drive a shared floor with no locked heights', () => {
    const { container } = renderAligned()
    for (const id of ['scroll-tall', 'pinned-tall']) {
      const { pinned, scroll } = splitRowCells(rowById(container, id))
      for (const cell of [...pinned, ...scroll]) {
        // No cell locks a fixed height — a locked side would clip or misalign
        // when the other side grows. Every cell shares the same min-height
        // floor and top-aligns its wrapping content.
        expect(cell.style.height).toBe('')
        expect(cell.style.minHeight).toBe('56px')
        expect(cell.className).toContain('items-start')
      }
    }
  })

  it('still applies a fixed rowHeight uniformly across both panes', () => {
    mountViewport()
    const { container } = render(
      <ReadOnlyTable
        data={data}
        columns={ALIGN_COLUMNS}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
        frozenColumns={1}
        rowHeight={88}
        enableRowVirtualization={false}
      />,
    )
    for (const id of ['scroll-tall', 'pinned-tall']) {
      const row = rowById(container, id)
      expect(row.style.height).toBe('88px')
      expect(row.style.minHeight).toBe('')
      const { pinned, scroll } = splitRowCells(row)
      for (const cell of [...pinned, ...scroll]) {
        // Fixed height locks both panes to the same pixel height (aligned).
        expect(cell.style.height).toBe('88px')
        expect(cell.style.minHeight).toBe('')
      }
    }
  })
})
