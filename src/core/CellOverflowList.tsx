import * as React from 'react'
import { useRef, useState } from 'react'
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect'
import { cn } from '../lib/cn'

export type CellOverflowListProps = {
  /** Arbitrary inline items. Each child is treated as one indivisible unit. */
  children: React.ReactNode
  /**
   * Customizes the collapsed indicator. Receives the number of hidden items.
   * Defaults to a small "+N" pill.
   */
  renderOverflow?: (hiddenCount: number) => React.ReactNode
  /** Horizontal gap (px) between items. Default 8 (matches Tailwind gap-2). */
  gap?: number
  className?: string
}

function DefaultOverflowIndicator({ count }: { count: number }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      +{count}
    </span>
  )
}

/**
 * Content-agnostic, opt-in overflow affordance for custom cells. Lays out an
 * arbitrary set of inline items within the fixed row height and the available
 * column width, showing as many as fit and collapsing the remainder into a
 * customizable "+N" indicator. Re-measures whenever the container resizes
 * (e.g. on column resize).
 *
 * Measurement is DOM-based (each child's natural width) rather than text-based,
 * because children are arbitrary React content with no inferable text — the
 * text-only `measure.ts` utility cannot size them.
 */
export function CellOverflowList({
  children,
  renderOverflow,
  gap = 8,
  className,
}: CellOverflowListProps) {
  const items = React.Children.toArray(children)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLSpanElement | null>>([])
  const indicatorRef = useRef<HTMLSpanElement | null>(null)
  const [visibleCount, setVisibleCount] = useState(items.length)

  const recompute = () => {
    const container = containerRef.current
    if (!container) return
    const available = container.clientWidth
    const widths = items.map((_, i) => {
      const el = itemRefs.current[i]
      return el ? el.getBoundingClientRect().width : 0
    })
    const totalAll = widths.reduce((sum, w, i) => sum + w + (i > 0 ? gap : 0), 0)

    let count: number
    if (items.length <= 1 || totalAll <= available) {
      count = items.length
    } else {
      // Reserve room for the indicator, then greedily fit items.
      const indicatorWidth = indicatorRef.current
        ? indicatorRef.current.getBoundingClientRect().width
        : 0
      const budget = available - indicatorWidth - gap
      let used = 0
      let fit = 0
      for (let i = 0; i < widths.length; i++) {
        const next = used + (widths[i] ?? 0) + (fit > 0 ? gap : 0)
        if (next <= budget) {
          used = next
          fit++
        } else {
          break
        }
      }
      count = fit
    }
    setVisibleCount((prev) => (prev === count ? prev : count))
  }

  // Keep the latest closure available to the (stable) ResizeObserver effect.
  const recomputeRef = useRef(recompute)
  recomputeRef.current = recompute

  // Re-measure after every render so item add/remove/content changes are caught.
  useIsomorphicLayoutEffect(() => {
    recomputeRef.current()
  })

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => recomputeRef.current())
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const hiddenCount = items.length - visibleCount
  const showIndicator = hiddenCount > 0

  return (
    <div
      ref={containerRef}
      className={cn('relative flex min-w-0 flex-1 items-center overflow-hidden', className)}
      style={{ gap }}
    >
      {items.slice(0, visibleCount).map((child, i) => (
        <span key={`v${i}`} className="inline-flex shrink-0 items-center">
          {child}
        </span>
      ))}
      {showIndicator &&
        (renderOverflow ? (
          renderOverflow(hiddenCount)
        ) : (
          <DefaultOverflowIndicator count={hiddenCount} />
        ))}

      {/* Hidden measurement layer: natural widths of every item + indicator. */}
      <div
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-[-9999px] flex"
        style={{ gap }}
      >
        {items.map((child, i) => (
          <span
            key={`m${i}`}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            className="inline-flex shrink-0 items-center"
          >
            {child}
          </span>
        ))}
        <span ref={indicatorRef} className="inline-flex shrink-0 items-center">
          {renderOverflow ? renderOverflow(items.length) : <DefaultOverflowIndicator count={items.length} />}
        </span>
      </div>
    </div>
  )
}
