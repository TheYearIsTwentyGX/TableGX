import { render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { EditableTable } from '../../src/components/EditableTable'
import { ReadOnlyTable } from '../../src/components/ReadOnlyTable'
import { TabbedTable } from '../../src/components/TabbedTable'
import type { PerfRow } from './harness'
import type { TabbedTableTab } from '../../src/types'
import {
  countRenderedCells,
  countRenderedRows,
  getScrollContainer,
  installJsdomViewport,
  makeDataset,
  perfMeasure,
  renderedColumnIds,
  renderedRowIds,
  setsDiffer,
  timeMedian,
} from './harness'
import {
  MAX_RENDERED_CELLS,
  MAX_RENDERED_ROWS,
  RENDER_BUDGET_MS,
  SCROLL_UPDATE_BUDGET_MS,
  VIEWPORT_HEIGHT_PX,
  VIEWPORT_WIDTH_PX,
} from './thresholds'

// Shared 1000x50 dataset for every case in this file.
const { data, columns } = makeDataset()

// Two tabs over the same rows so the TabbedTable cases exercise its tab strip,
// shared filter/sort state, and slide wrapper while the active tab still mounts
// the full 1000x50 grid the guard cares about.
const tabbedTabs: TabbedTableTab<PerfRow>[] = [
  { id: 'all', label: 'All', columns },
  { id: 'half', label: 'Half', columns: columns.slice(0, Math.ceil(columns.length / 2)) },
]

let restoreViewport: (() => void) | null = null
afterEach(() => {
  restoreViewport?.()
  restoreViewport = null
})

/** Set scrollTop/scrollLeft and notify the virtualizers (wrapped in act). */
function scrollTo(el: HTMLElement, { top, left }: { top?: number; left?: number }) {
  act(() => {
    if (top !== undefined) el.scrollTop = top
    if (left !== undefined) el.scrollLeft = left
    el.dispatchEvent(new Event('scroll'))
  })
}

describe('virtualizer performance guard (jsdom)', () => {
  it('ReadOnlyTable: 1000x50 stays a bounded DOM window and mounts within budget', () => {
    restoreViewport = installJsdomViewport({
      width: VIEWPORT_WIDTH_PX,
      height: VIEWPORT_HEIGHT_PX,
    })

    const make = () => (
      <ReadOnlyTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
      />
    )

    // Median mount time over several runs (warmups discarded).
    let last: ReturnType<typeof render> | null = null
    const renderMs = timeMedian(
      () => {
        last?.unmount()
        last = render(make())
      },
      { warmup: 2, runs: 5 },
    )

    const container = last!.container

    // Virtualization invariant: a 1000x50 grid is 50,000 logical cells; only a
    // bounded viewport window may ever be in the DOM.
    const rows = countRenderedRows(container)
    const cells = countRenderedCells(container)
    expect(rows).toBeGreaterThan(0)
    expect(rows).toBeLessThanOrEqual(MAX_RENDERED_ROWS)
    expect(cells).toBeGreaterThan(0)
    expect(cells).toBeLessThanOrEqual(MAX_RENDERED_CELLS)

    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS)

    last!.unmount()
  })

  it('ReadOnlyTable: scrolling shifts the window, keeps it bounded, within budget', () => {
    restoreViewport = installJsdomViewport({
      width: VIEWPORT_WIDTH_PX,
      height: VIEWPORT_HEIGHT_PX,
    })

    const { container } = render(
      <ReadOnlyTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
      />,
    )
    const scroller = getScrollContainer(container)

    const rowsBefore = renderedRowIds(container)
    const colsBefore = renderedColumnIds(container)

    // Vertical scroll drives the TanStack row virtualizer.
    scrollTo(scroller, { top: 20000 })
    const rowsAfter = renderedRowIds(container)
    expect(setsDiffer(rowsBefore, rowsAfter)).toBe(true)

    // Horizontal scroll drives the custom column virtualization.
    scrollTo(scroller, { left: 4000 })
    const colsAfter = renderedColumnIds(container)
    expect(setsDiffer(colsBefore, colsAfter)).toBe(true)

    // Window stays bounded after scrolling.
    expect(countRenderedRows(container)).toBeLessThanOrEqual(MAX_RENDERED_ROWS)
    expect(countRenderedCells(container)).toBeLessThanOrEqual(MAX_RENDERED_CELLS)

    // Median per-scroll-update cost. Alternate vertical/horizontal targets so
    // each update genuinely moves the window rather than no-opping.
    let i = 0
    const updateMs = timeMedian(
      () => {
        i++
        scrollTo(scroller, { top: 1000 + ((i * 1500) % 40000) })
        scrollTo(scroller, { left: ((i * 800) % 6000) })
      },
      { warmup: 3, runs: 8 },
    )
    expect(updateMs).toBeLessThan(SCROLL_UPDATE_BUDGET_MS)
  })

  it('EditableTable: 1000x50 stays a bounded DOM window and mounts within budget', () => {
    restoreViewport = installJsdomViewport({
      width: VIEWPORT_WIDTH_PX,
      height: VIEWPORT_HEIGHT_PX,
    })

    const editableColumnIds = columns.map((c) => c.id as string)
    const make = () => (
      <EditableTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight={`${VIEWPORT_HEIGHT_PX}px`}
        measure={perfMeasure}
        editableColumnIds={editableColumnIds}
        onSaveEdit={async () => true}
      />
    )

    let last: ReturnType<typeof render> | null = null
    const renderMs = timeMedian(
      () => {
        last?.unmount()
        last = render(make())
      },
      { warmup: 2, runs: 5 },
    )

    const container = last!.container
    expect(countRenderedRows(container)).toBeLessThanOrEqual(MAX_RENDERED_ROWS)
    expect(countRenderedCells(container)).toBeLessThanOrEqual(MAX_RENDERED_CELLS)
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS)

    last!.unmount()
  })

  it('TabbedTable: 1000x50 active tab stays a bounded DOM window and mounts within budget', () => {
    restoreViewport = installJsdomViewport({
      width: VIEWPORT_WIDTH_PX,
      height: VIEWPORT_HEIGHT_PX,
    })

    const make = () => (
      <TabbedTable
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabbedTabs}
        defaultTabId="all"
        measure={perfMeasure}
      />
    )

    let last: ReturnType<typeof render> | null = null
    const renderMs = timeMedian(
      () => {
        last?.unmount()
        last = render(make())
      },
      { warmup: 2, runs: 5 },
    )

    const container = last!.container

    // The active tab mounts the same virtualized engine: a 1000x50 grid is
    // 50,000 logical cells; only a bounded viewport window may be in the DOM.
    const rows = countRenderedRows(container)
    const cells = countRenderedCells(container)
    expect(rows).toBeGreaterThan(0)
    expect(rows).toBeLessThanOrEqual(MAX_RENDERED_ROWS)
    expect(cells).toBeGreaterThan(0)
    expect(cells).toBeLessThanOrEqual(MAX_RENDERED_CELLS)

    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS)

    last!.unmount()
  })

  it('TabbedTable: scrolling shifts the window, keeps it bounded, within budget', () => {
    restoreViewport = installJsdomViewport({
      width: VIEWPORT_WIDTH_PX,
      height: VIEWPORT_HEIGHT_PX,
    })

    const { container } = render(
      <TabbedTable
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabbedTabs}
        defaultTabId="all"
        measure={perfMeasure}
      />,
    )
    const scroller = getScrollContainer(container)

    const rowsBefore = renderedRowIds(container)
    const colsBefore = renderedColumnIds(container)

    // Vertical scroll drives the TanStack row virtualizer.
    scrollTo(scroller, { top: 20000 })
    const rowsAfter = renderedRowIds(container)
    expect(setsDiffer(rowsBefore, rowsAfter)).toBe(true)

    // Horizontal scroll drives the custom column virtualization.
    scrollTo(scroller, { left: 4000 })
    const colsAfter = renderedColumnIds(container)
    expect(setsDiffer(colsBefore, colsAfter)).toBe(true)

    // Window stays bounded after scrolling.
    expect(countRenderedRows(container)).toBeLessThanOrEqual(MAX_RENDERED_ROWS)
    expect(countRenderedCells(container)).toBeLessThanOrEqual(MAX_RENDERED_CELLS)

    // Median per-scroll-update cost, alternating vertical/horizontal targets so
    // each update genuinely moves the window rather than no-opping.
    let i = 0
    const updateMs = timeMedian(
      () => {
        i++
        scrollTo(scroller, { top: 1000 + ((i * 1500) % 40000) })
        scrollTo(scroller, { left: ((i * 800) % 6000) })
      },
      { warmup: 3, runs: 8 },
    )
    expect(updateMs).toBeLessThan(SCROLL_UPDATE_BUDGET_MS)
  })
})
