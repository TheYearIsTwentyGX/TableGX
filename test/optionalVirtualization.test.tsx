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
