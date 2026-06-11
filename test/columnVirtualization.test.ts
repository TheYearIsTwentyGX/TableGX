import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  computeColumnRange,
  computeOffsets,
  computeWindowRange,
  useColumnVirtualization,
} from '../src/hooks/useColumnVirtualization'

describe('computeOffsets', () => {
  it('builds prefix sums', () => {
    expect(computeOffsets([100, 200, 50])).toEqual([0, 100, 300, 350])
  })
})

describe('computeColumnRange', () => {
  const offsets = computeOffsets(Array.from({ length: 100 }, () => 100)) // 100 cols × 100px

  it('returns the visible window plus overscan', () => {
    const range = computeColumnRange(1000, 500, offsets, 2)
    // scrollLeft 1000 → first visible col 10; right edge 1500 → last visible col 14.
    expect(range.start).toBe(8)
    expect(range.end).toBe(16)
  })

  it('clamps at the edges', () => {
    expect(computeColumnRange(0, 500, offsets, 3).start).toBe(0)
    const tail = computeColumnRange(9900, 500, offsets, 3)
    expect(tail.end).toBe(99)
  })

  it('handles empty column lists', () => {
    expect(computeColumnRange(0, 500, [0])).toEqual({ start: 0, end: -1 })
  })
})

describe('computeWindowRange', () => {
  const offsets = computeOffsets(Array.from({ length: 100 }, () => 100))

  it('returns the columns intersecting the pixel window', () => {
    expect(computeWindowRange(1000, 1500, offsets)).toEqual({ start: 10, end: 14 })
  })

  it('clamps at the edges', () => {
    expect(computeWindowRange(-500, 200, offsets)).toEqual({ start: 0, end: 1 })
    expect(computeWindowRange(9950, 20000, offsets)).toEqual({ start: 99, end: 99 })
  })

  it('handles empty column lists', () => {
    expect(computeWindowRange(0, 500, [0])).toEqual({ start: 0, end: -1 })
  })
})

describe('useColumnVirtualization (hysteresis window)', () => {
  const widths = Array.from({ length: 100 }, () => 100)

  function setup() {
    let scrollLeft = 0
    const hook = renderHook(() => useColumnVirtualization(widths, 500, () => scrollLeft))
    return {
      hook,
      scrollTo(left: number) {
        scrollLeft = left
        act(() => hook.result.current.onScroll())
      },
    }
  }

  it('renders a window wider than the viewport from the start', () => {
    const { hook } = setup()
    const { range } = hook.result.current
    expect(range.start).toBe(0)
    // Viewport covers cols 0..4; the window must extend well past it.
    expect(range.end).toBeGreaterThanOrEqual(7)
  })

  it('keeps the same range while the viewport stays inside the window', () => {
    const { hook, scrollTo } = setup()
    const before = hook.result.current.range
    // Well inside the rendered window — no commit expected.
    scrollTo(100)
    expect(hook.result.current.range).toBe(before)
  })

  it('refills ahead of the scroll direction when the viewport nears the edge', () => {
    const { hook, scrollTo } = setup()
    const before = hook.result.current.range
    const jumpTo = (before.end + 1) * 100 // viewport right edge past the window
    scrollTo(jumpTo)
    const after = hook.result.current.range
    // The new window must cover the viewport (cols jumpTo/100 .. +5) and
    // extend beyond its right edge for the next frames of scrolling.
    expect((after.start) * 100).toBeLessThanOrEqual(jumpTo)
    expect((after.end + 1) * 100).toBeGreaterThanOrEqual(jumpTo + 500 + 100)
  })
})
