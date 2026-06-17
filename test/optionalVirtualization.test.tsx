import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { TabbedTable } from '../src/components/TabbedTable'
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
