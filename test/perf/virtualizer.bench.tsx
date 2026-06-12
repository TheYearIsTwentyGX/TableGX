import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { ReadOnlyTable } from '../../src/components/ReadOnlyTable'
import {
  countRenderedCells,
  countRenderedRows,
  getScrollContainer,
  makeDataset,
  median,
  perfMeasure,
  renderedColumnIds,
  renderedRowIds,
  setsDiffer,
} from './harness'
import {
  BROWSER_SCROLL_STEP_BUDGET_MS,
  MAX_RENDERED_CELLS,
  MAX_RENDERED_ROWS,
  VIEWPORT_HEIGHT_PX,
  VIEWPORT_WIDTH_PX,
} from './thresholds'

// The library's layout classes come from Tailwind in the consuming app, which
// is not present here. The benchmark only needs a bounded, scrollable viewport
// so the virtualizers see real layout + scroll; inject just that.
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

test('ReadOnlyTable 1000x50 stays smooth under programmatic scrolling', async () => {
  root.render(
    <ReadOnlyTable
      data={data}
      columns={columns}
      getRowId={(r) => r.id}
      measure={perfMeasure}
    />,
  )

  // Let the layout effect read the viewport and the virtualizers settle.
  await nextFrame()
  await nextFrame()

  const scroller = getScrollContainer(host)

  // Virtualization invariant holds in a real browser too.
  expect(countRenderedRows(host)).toBeGreaterThan(0)
  expect(countRenderedRows(host)).toBeLessThanOrEqual(MAX_RENDERED_ROWS)
  expect(countRenderedCells(host)).toBeLessThanOrEqual(MAX_RENDERED_CELLS)

  const rowsBefore = renderedRowIds(host)
  const colsBefore = renderedColumnIds(host)

  // Programmatically scroll across many steps, measuring per-step wall-clock
  // time (set scroll + one committed frame). Sweep vertically with a periodic
  // horizontal sweep so both virtualizers do real work. The first WARMUP steps
  // are discarded (initial paint of the large scroll area is a one-off cost),
  // and we report the median so a single GC/paint spike can't dominate.
  const STEPS = 40
  const WARMUP = 6
  const maxTop = scroller.scrollHeight - scroller.clientHeight
  const maxLeft = scroller.scrollWidth - scroller.clientWidth
  const times: number[] = []

  for (let i = 1; i <= STEPS; i++) {
    const top = Math.round((maxTop * i) / STEPS)
    const left = Math.round((maxLeft * ((i % 7) + 1)) / 8)
    const start = performance.now()
    scroller.scrollTop = top
    scroller.scrollLeft = left
    await nextFrame()
    if (i > WARMUP) times.push(performance.now() - start)
  }

  const sorted = [...times].sort((a, b) => a - b)
  const medianStep = median(times)
  const minStep = sorted[0] ?? 0
  const maxStep = sorted[sorted.length - 1] ?? 0
  // eslint-disable-next-line no-console
  console.log(
    `[perf] scroll step ms — median ${medianStep.toFixed(1)}, ` +
      `min ${minStep.toFixed(1)}, max ${maxStep.toFixed(1)}`,
  )

  // Park the table at a known non-origin position and let it commit, so the
  // window-shift assertions compare against a genuinely scrolled state (not a
  // step that happened to land back near the origin).
  scroller.scrollTop = Math.round(maxTop / 2)
  scroller.scrollLeft = Math.round(maxLeft / 2)
  await nextFrame()
  await nextFrame()

  // The window actually moved, and stayed bounded throughout.
  expect(setsDiffer(rowsBefore, renderedRowIds(host))).toBe(true)
  expect(setsDiffer(colsBefore, renderedColumnIds(host))).toBe(true)
  expect(countRenderedRows(host)).toBeLessThanOrEqual(MAX_RENDERED_ROWS)
  expect(countRenderedCells(host)).toBeLessThanOrEqual(MAX_RENDERED_CELLS)

  expect(medianStep).toBeLessThan(BROWSER_SCROLL_STEP_BUDGET_MS)
})
