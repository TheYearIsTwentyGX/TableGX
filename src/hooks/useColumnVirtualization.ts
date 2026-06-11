import { useCallback, useMemo, useRef, useState } from 'react'
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect'

export type ColumnRange = {
  /** Inclusive start index into the scrollable column list. */
  start: number
  /** Inclusive end index into the scrollable column list. */
  end: number
}

const OVERSCAN_COLUMNS = 3

/**
 * Pixels of buffer the rendered window must keep beyond both viewport edges.
 * The window is only recomputed when the viewport eats into this margin, so
 * steady scrolling commits once per window refill instead of once per column.
 */
const SLACK_PX = 120
/** Pixels rendered behind the trailing edge after a refill. */
const BACK_PX = 240
/** Minimum pixels rendered ahead of the leading edge after a refill. */
const LEAD_MIN_PX = 600
/** Lookahead horizon: render what the viewport will reach within this time. */
const LEAD_TIME_MS = 250

/**
 * Computes the visible index range of the scrollable (non-pinned) columns from
 * the current scrollLeft, the cumulative widths, and the visible pane width.
 * Pure — exported for tests.
 */
export function computeColumnRange(
  scrollLeft: number,
  paneWidth: number,
  offsets: number[],
  overscan: number = OVERSCAN_COLUMNS,
): ColumnRange {
  const count = offsets.length - 1
  if (count <= 0) return { start: 0, end: -1 }
  const window = computeWindowRange(scrollLeft, scrollLeft + paneWidth, offsets)
  return {
    start: Math.max(0, window.start - overscan),
    end: Math.min(count - 1, window.end + overscan),
  }
}

/**
 * Index range of the columns intersecting [windowLeft, windowRight], in pixels.
 * Pure — exported for tests.
 */
export function computeWindowRange(
  windowLeft: number,
  windowRight: number,
  offsets: number[],
): ColumnRange {
  const count = offsets.length - 1
  if (count <= 0) return { start: 0, end: -1 }

  // Binary search for the first column whose right edge is past windowLeft.
  let lo = 0
  let hi = count - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((offsets[mid + 1] ?? 0) <= windowLeft) lo = mid + 1
    else hi = mid
  }
  const first = lo

  let last = first
  while (last + 1 < count && (offsets[last + 1] ?? 0) < windowRight) last++

  return { start: first, end: last }
}

/** Prefix sums of column widths: offsets[i] = left edge of column i; offsets[n] = total. */
export function computeOffsets(widths: number[]): number[] {
  const offsets = new Array<number>(widths.length + 1)
  offsets[0] = 0
  for (let i = 0; i < widths.length; i++) {
    offsets[i + 1] = (offsets[i] ?? 0) + (widths[i] ?? 0)
  }
  return offsets
}

/**
 * Manual column virtualization for the scroll pane (spec §13.2).
 *
 * The rendered window is wider than the viewport and held until the viewport
 * scrolls within SLACK_PX of its edge (hysteresis), then refilled with extra
 * columns ahead of the scroll direction sized by the current scroll velocity.
 * Fast horizontal scrolling therefore reveals pre-rendered columns instead of
 * waiting for a React commit per column boundary.
 */
export function useColumnVirtualization(
  widths: number[],
  paneWidth: number,
  getScrollLeft: () => number,
): { range: ColumnRange; offsets: number[]; totalWidth: number; onScroll: () => void } {
  const offsets = useMemo(() => computeOffsets(widths), [widths])
  const totalWidth = offsets[offsets.length - 1] ?? 0

  const [range, setRange] = useState<ColumnRange>(() =>
    computeColumnRange(0, paneWidth || 1920, offsets),
  )

  // Last scroll sample for velocity estimation (px/ms, signed).
  const sampleRef = useRef({ left: 0, time: 0 })

  const update = useCallback(
    (force: boolean) => {
      const count = offsets.length - 1
      const pane = paneWidth || 1920
      const left = getScrollLeft()

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const prev = sampleRef.current
      const dt = now - prev.time
      // Samples older than ~a few frames describe a different gesture.
      const velocity = !force && dt > 0 && dt < 120 ? (left - prev.left) / dt : 0
      sampleRef.current = { left, time: now }

      setRange((current) => {
        if (count <= 0) {
          return current.start === 0 && current.end === -1 ? current : { start: 0, end: -1 }
        }

        if (!force && current.end >= current.start) {
          const coveredLeft = offsets[current.start] ?? 0
          const coveredRight = offsets[current.end + 1] ?? 0
          const needLeft = Math.max(0, left - SLACK_PX)
          const needRight = Math.min(totalWidth, left + pane + SLACK_PX)
          if (coveredLeft <= needLeft && coveredRight >= needRight) return current
        }

        const lead = Math.min(
          Math.max(LEAD_MIN_PX, Math.abs(velocity) * LEAD_TIME_MS),
          Math.max(800, pane),
        )
        const forward = velocity >= 0
        const next = computeWindowRange(
          left - (forward ? BACK_PX : lead),
          left + pane + (forward ? lead : BACK_PX),
          offsets,
        )
        return current.start === next.start && current.end === next.end ? current : next
      })
    },
    [offsets, paneWidth, getScrollLeft, totalWidth],
  )

  // Re-derive when widths or pane size change (pre-paint, no flicker). Forced:
  // the current indices may be stale against the new offsets.
  useIsomorphicLayoutEffect(() => {
    update(true)
  }, [update])

  // Wrapped so the DOM event object never leaks into the `force` parameter.
  const onScroll = useCallback(() => update(false), [update])

  return { range, offsets, totalWidth, onScroll }
}
