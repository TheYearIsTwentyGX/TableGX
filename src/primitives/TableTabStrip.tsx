import { motion } from 'framer-motion'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect'
import { cn } from '../lib/cn'
import { TooltipProvider } from '../ui/tooltip'
import { TabColumnPreview } from './TabColumnPreview'
import { useTableStore } from './store'

/** A filled, rounded-corner triangle used for the tab-strip step arrows. */
function TabArrow({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden focusable="false">
      <path
        d={dir === 'right' ? 'M9 6 L17 12 L9 18 Z' : 'M15 6 L7 12 L15 18 Z'}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export type TableTabStripProps = {
  /** Stretchy middle region of the strip (e.g. filter badges). */
  centerContent?: ReactNode
  /** Right-aligned region of the strip (e.g. actions + column picker). */
  endContent?: ReactNode
}

/**
 * The folder-tab strip: the tab buttons, the sliding active-tab indicator
 * (`layoutId`-driven), and the Excel-style overflow step arrows. Reads the tab
 * set + active id from the store; chrome slots are supplied by the caller so
 * they can be reordered or omitted.
 */
export function TableTabStrip({ centerContent, endContent }: TableTabStripProps) {
  const {
    tabs,
    activeId,
    selectTab,
    indicatorLayoutId,
    classNames,
    tabColumnPreviewDelayMs,
    tabColumnPreviewPosition,
  } = useTableStore()

  // ----- Horizontal tab-strip scrolling (Excel-style step arrows) -----
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const activeTabRef = useRef<HTMLButtonElement | null>(null)

  const [scrollState, setScrollState] = useState({
    overflow: false,
    atStart: true,
    atEnd: true,
  })
  const syncScrollState = useCallback(() => {
    const c = tabListRef.current
    if (!c) return
    const max = c.scrollWidth - c.clientWidth
    setScrollState((prev) => {
      const next = {
        overflow: max > 1,
        atStart: c.scrollLeft <= 1,
        atEnd: c.scrollLeft >= max - 1,
      }
      return prev.overflow === next.overflow &&
        prev.atStart === next.atStart &&
        prev.atEnd === next.atEnd
        ? prev
        : next
    })
  }, [])

  // Keep the active tab in view when the active id changes (click or
  // programmatic), and recompute the arrow state on scroll/resize.
  useIsomorphicLayoutEffect(() => {
    const container = tabListRef.current
    const btn = activeTabRef.current
    if (!container || !btn) return
    const cRect = container.getBoundingClientRect()
    const bRect = btn.getBoundingClientRect()
    if (bRect.left < cRect.left) {
      container.scrollLeft -= cRect.left - bRect.left
    } else if (bRect.right > cRect.right) {
      container.scrollLeft += bRect.right - cRect.right
    }
  }, [activeId])

  useIsomorphicLayoutEffect(() => {
    const c = tabListRef.current
    if (!c) return
    syncScrollState()
    const onScroll = () => syncScrollState()
    c.addEventListener('scroll', onScroll, { passive: true })
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => syncScrollState())
      ro.observe(c)
    }
    return () => {
      c.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    }
  }, [syncScrollState])

  // The tab set changing alters scrollWidth without resizing the container.
  useIsomorphicLayoutEffect(() => {
    syncScrollState()
  }, [tabs.length, syncScrollState])

  // Scroll one tab toward `dir` (-1 left, +1 right), revealing the next
  // partially-hidden tab — like Excel's sheet-tab arrows.
  const scrollByTab = useCallback((dir: number) => {
    const c = tabListRef.current
    if (!c) return
    const cRect = c.getBoundingClientRect()
    const btns = Array.from(c.querySelectorAll<HTMLButtonElement>('button'))
    let target: number
    if (dir > 0) {
      const next = btns.find((b) => b.getBoundingClientRect().right > cRect.right + 1)
      target = next
        ? c.scrollLeft + (next.getBoundingClientRect().right - cRect.right)
        : c.scrollWidth
    } else {
      const before = btns.filter((b) => b.getBoundingClientRect().left < cRect.left - 1)
      const prev = before[before.length - 1]
      target = prev ? c.scrollLeft - (cRect.left - prev.getBoundingClientRect().left) : 0
    }
    c.scrollTo({ left: target, behavior: 'smooth' })
  }, [])

  return (
    // A single shared provider so Radix's skip-delay behavior works across
    // tabs: hopping to another tab while a preview is already open (or just
    // closed, within skipDelayDuration) opens the next one immediately
    // instead of waiting out the full hover delay again.
    <TooltipProvider delayDuration={tabColumnPreviewDelayMs ?? 600}>
      <div
        data-tgx-tab-strip=""
        className={cn(
          'flex shrink-0 items-stretch gap-3 border-b border-border bg-muted/40 pr-2',
          classNames?.tabStrip,
        )}
      >
        <div className="flex min-w-0 flex-1 items-stretch">
          {scrollState.overflow && (
            <button
              type="button"
              aria-label="Scroll tabs left"
              disabled={scrollState.atStart}
              onClick={() => scrollByTab(-1)}
              className={cn(
                'mx-1 flex shrink-0 items-center self-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-30',
                classNames?.tabScrollButton,
              )}
            >
              <TabArrow dir="left" />
            </button>
          )}
          <div
            ref={tabListRef}
            className="tgx-tab-scroll flex min-w-0 flex-1 items-end overflow-x-auto pb-0.5 -mb-0.5"
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeId
              const tabButton = (
                <button
                  ref={isActive ? activeTabRef : undefined}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  className={cn(
                    'relative -mb-px rounded-t-md border-x border-t px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? cn('border-border bg-card text-foreground', classNames?.activeTab)
                      : cn(
                          'border-transparent bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                          classNames?.inactiveTab,
                        ),
                    classNames?.tab,
                  )}
                >
                  {isActive && (
                    <span aria-hidden className="absolute inset-x-0 -bottom-px h-px bg-card" />
                  )}
                  {isActive && (
                    <motion.span
                      layoutId={indicatorLayoutId}
                      className={cn(
                        'absolute inset-x-0 bottom-0 z-10 h-0.5 bg-primary',
                        classNames?.tabIndicator,
                      )}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              )
              return (
                <TabColumnPreview
                  key={tab.id}
                  labels={tab.columnPreviewLabels}
                  delayMs={tabColumnPreviewDelayMs ?? 600}
                  position={tabColumnPreviewPosition ?? 'auto'}
                  className={classNames?.tabColumnPreview}
                >
                  {tabButton}
                </TabColumnPreview>
              )
            })}
          </div>
          {scrollState.overflow && (
            <button
              type="button"
              aria-label="Scroll tabs right"
              disabled={scrollState.atEnd}
              onClick={() => scrollByTab(1)}
              className={cn(
                'mx-1 flex shrink-0 items-center self-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-30',
                classNames?.tabScrollButton,
              )}
            >
              <TabArrow dir="right" />
            </button>
          )}
        </div>
        {/* --- Middle slot (e.g. filter badges); keeps its space so the tab
            list scrolls instead of squeezing it out --- */}
        <div className="flex shrink-0 items-center justify-end self-center">{centerContent}</div>
        {endContent && (
          <div className="flex shrink-0 items-center gap-2 self-center">{endContent}</div>
        )}
      </div>
    </TooltipProvider>
  )
}
