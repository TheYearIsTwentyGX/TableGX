import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { FROZEN_PANE_MAX_FRACTION } from '../src/constants'
import { computeHeaderFloors } from '../src/hooks/useAutoColumnWidths'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn } from '../src/types'

type Row = { id: string; a: string; b: string; c: string; d: string }

const measure: MeasureTextFn = (text) => text.length * 8

const VIEWPORT_WIDTH_PX = 800

// Long headers over one-character values — the shape a frozen pane usually
// holds (ids, codes, states). Each column's auto width is its header floor, so
// any proportional shrink of the pane clips a label.
const columns = [
  textColumn<Row>('a', 'Column Number One'),
  textColumn<Row>('b', 'Column Number Two'),
  textColumn<Row>('c', 'Column Number Three'),
  textColumn<Row>('d', 'Scrollable'),
]

const data: Row[] = [{ id: '1', a: 'x', b: 'x', c: 'x', d: 'x' }]

// Short headers over wide values: these columns carry slack above their floor,
// so the pane is free to scale them down to the cap.
const slackColumns = [
  textColumn<Row>('a', 'A'),
  textColumn<Row>('b', 'B'),
  textColumn<Row>('c', 'C'),
  textColumn<Row>('d', 'D'),
]

/** jsdom reports zero-sized elements; give the viewport a real width. */
async function withViewport(fn: () => Promise<void>) {
  const sizeProps = {
    offsetWidth: { configurable: true, get: () => VIEWPORT_WIDTH_PX },
    offsetHeight: { configurable: true, get: () => 400 },
    clientWidth: { configurable: true, get: () => VIEWPORT_WIDTH_PX },
    clientHeight: { configurable: true, get: () => 400 },
  }
  const originals = Object.fromEntries(
    Object.keys(sizeProps).map((k) => [
      k,
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, k) ??
        Object.getOwnPropertyDescriptor(Element.prototype, k),
    ]),
  )
  for (const [k, d] of Object.entries(sizeProps)) {
    Object.defineProperty(HTMLElement.prototype, k, d)
  }
  try {
    await fn()
  } finally {
    for (const k of Object.keys(sizeProps)) {
      const orig = originals[k]
      if (orig) Object.defineProperty(HTMLElement.prototype, k, orig)
      else Reflect.deleteProperty(HTMLElement.prototype, k)
    }
  }
}

/** Inline width of a rendered header cell, in px. */
function headerWidth(container: HTMLElement, id: string): number {
  const cells = container.querySelectorAll<HTMLElement>(`[data-tgx-header="${id}"]`)
  const cell = cells[0]
  if (!cell) throw new Error(`no header rendered for ${id}`)
  return Number.parseFloat(cell.style.width)
}

describe('frozen pane width scaling', () => {
  const floors = computeHeaderFloors<Row>({ columns, data, measure })

  it('never scales a pinned column below its header floor', async () => {
    await withViewport(async () => {
      const { container } = render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          frozenColumns={3}
          measure={measure}
        />,
      )
      await waitFor(() => expect(headerWidth(container, 'a')).toBeGreaterThan(0))

      // Each floor is pad 24 + label + margin 4 + sort 24 + filter 28, so the
      // three come to 216 + 216 + 232 = 664 against a 400 cap — the old
      // proportional shrink clipped every one of those labels.
      const pinnedFloorSum = floors.get('a')! + floors.get('b')! + floors.get('c')!
      expect(pinnedFloorSum).toBeGreaterThan(VIEWPORT_WIDTH_PX * FROZEN_PANE_MAX_FRACTION)

      for (const id of ['a', 'b', 'c'] as const) {
        expect(headerWidth(container, id)).toBeGreaterThanOrEqual(floors.get(id)!)
      }

      // The pane declares exactly what its columns occupy.
      const pane = container.querySelector<HTMLElement>(
        '[data-tgx-header-block] [data-tgx-pinned]',
      )
      if (!pane) throw new Error('no pinned header pane rendered')
      expect(Number.parseFloat(pane.style.width)).toBeCloseTo(pinnedFloorSum, 1)
    })
  })

  it('still shrinks pinned columns that have room above their floor', async () => {
    // Wide content (not a wide header) gives these columns slack: the pane can
    // scale them down toward the cap without touching their labels.
    const wide: Row[] = [{ id: '1', a: 'W'.repeat(40), b: 'W'.repeat(40), c: 'x', d: 'x' }]
    const slackFloors = computeHeaderFloors<Row>({ columns: slackColumns, data: wide, measure })
    await withViewport(async () => {
      const { container } = render(
        <ReadOnlyTable<Row>
          data={wide}
          columns={slackColumns}
          getRowId={(r) => r.id}
          frozenColumns={2}
          measure={measure}
        />,
      )
      await waitFor(() => expect(headerWidth(container, 'a')).toBeGreaterThan(0))

      // Content width 40*8 + 24 + 4 = 348 each, so 696 unscaled against a 400
      // cap — and a floor of only 88, which the 200px result clears.
      const total = headerWidth(container, 'a') + headerWidth(container, 'b')
      expect(total).toBeCloseTo(VIEWPORT_WIDTH_PX * FROZEN_PANE_MAX_FRACTION, 1)
      expect(headerWidth(container, 'a')).toBeLessThan(348)
      expect(headerWidth(container, 'a')).toBeGreaterThanOrEqual(slackFloors.get('a')!)
    })
  })
})
