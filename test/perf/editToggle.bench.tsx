import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { TableGX } from '../../src/components/TableGX'
import type { PerfRow } from './harness'
import { countRenderedRows, getScrollContainer, makeDataset, perfMeasure } from './harness'
import { VIEWPORT_HEIGHT_PX, VIEWPORT_WIDTH_PX } from './thresholds'

// The library's layout classes come from Tailwind in the consuming app, which
// is not present here. This test only needs a bounded, scrollable viewport so
// the virtualizers see real layout + scroll; inject just that (mirrors the
// scroll bench).
const STYLE_ID = 'tgx-perf-style'
function installStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .tgx-scrollbar {
      width: ${VIEWPORT_WIDTH_PX}px;
      height: ${VIEWPORT_HEIGHT_PX}px;
      overflow: auto;
      position: relative;
    }
  `
  document.head.appendChild(style)
}

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  installStyle()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  root.unmount()
  host.remove()
})

const { data, columns } = makeDataset()

/** Row ids currently shown as selected in the DOM (only visible rows render). */
function selectedRowIdsInDom(node: ParentNode): string[] {
  return Array.from(node.querySelectorAll<HTMLElement>('[data-tgx-row][data-selected]'))
    .map((el) => el.getAttribute('data-tgx-row') ?? '')
    .sort()
}

// TableGX's single-table `editable` boolean flips read-only <-> inline editing
// live. The core promise is that flipping it re-renders the SAME table rather
// than remounting it, so the user's scroll position and row selection survive.
// jsdom can't prove this (no real layout/scroll), so verify it in a real
// browser: scroll a large dataset, select rows, toggle `editable`
// true->false->true, and assert the scroll offset, the scroll container
// identity, and the selected row ids are all unchanged.
test('TableGX variant="table" preserves scroll + selection across an editable toggle', async () => {
  // Uncontrolled selection: the table owns the selection state internally, so a
  // remount would reset it. We only observe it via the callback + the DOM.
  let captured: string[] = []
  const onSelectedRowIdsChange = (ids: string[]) => {
    captured = ids
  }

  const renderApp = (editable: boolean) =>
    root.render(
      <TableGX<PerfRow>
        variant="table"
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        measure={perfMeasure}
        enableRowSelection
        onSelectedRowIdsChange={onSelectedRowIdsChange}
        editable={editable}
        editableColumnIds={['col0']}
        onSaveEdit={async () => true}
      />,
    )

  // Start in editable mode so the toggle sequence is true -> false -> true.
  renderApp(true)
  await nextFrame()
  await nextFrame()

  const scroller = getScrollContainer(host)
  expect(countRenderedRows(host)).toBeGreaterThan(0)

  // Scroll well into the dataset so we are nowhere near the origin.
  const maxTop = scroller.scrollHeight - scroller.clientHeight
  scroller.scrollTop = Math.round(maxTop / 2)
  await nextFrame()
  await nextFrame()

  // Select a few of the rows currently in the virtualized window by clicking
  // their selection checkboxes (Radix renders them as role="checkbox" buttons).
  const rowEls = Array.from(host.querySelectorAll<HTMLElement>('[data-tgx-row]'))
  expect(rowEls.length).toBeGreaterThan(3)
  for (const rowEl of rowEls.slice(0, 3)) {
    const checkbox = rowEl.querySelector<HTMLElement>('[role="checkbox"]')
    if (!checkbox) throw new Error('row has no selection checkbox')
    checkbox.click()
    await nextFrame()
  }

  const scrollBefore = scroller.scrollTop
  const selectedDomBefore = selectedRowIdsInDom(host)
  const selectedIdsBefore = [...captured].sort()

  // Sanity: we actually scrolled and actually selected three rows.
  expect(scrollBefore).toBeGreaterThan(0)
  expect(selectedDomBefore).toHaveLength(3)
  expect(selectedIdsBefore).toHaveLength(3)
  expect(selectedDomBefore).toEqual(selectedIdsBefore)

  // Flip editable true -> false -> true. Re-rendering the same element type
  // with a new prop is exactly what a parent toggling `editable` does live.
  renderApp(false)
  await nextFrame()
  await nextFrame()
  renderApp(true)
  await nextFrame()
  await nextFrame()

  // The scroll container is the SAME DOM node — i.e. the table was not
  // remounted — so its scroll offset carried over untouched.
  expect(getScrollContainer(host)).toBe(scroller)
  expect(scroller.scrollTop).toBe(scrollBefore)

  // Selection survived: both the public selectedRowIds API and the DOM agree
  // with the pre-toggle state.
  expect([...captured].sort()).toEqual(selectedIdsBefore)
  expect(selectedRowIdsInDom(host)).toEqual(selectedDomBefore)
})
