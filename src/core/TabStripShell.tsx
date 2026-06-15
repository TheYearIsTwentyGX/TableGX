import { AnimatePresence, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect'
import { cn } from '../lib/cn'
import type { TabbedTableClassNames } from '../types'

const slideTransition = { type: 'spring', stiffness: 320, damping: 34 } as const

type SlideCustom = { dir: number; width: number }

const panelVariants = {
  enter: ({ dir, width }: SlideCustom) => ({ x: dir > 0 ? width : -width }),
  center: { x: 0 },
  exit: ({ dir, width }: SlideCustom) => ({ x: dir > 0 ? -width : width }),
}

function TabPanel({
  custom,
  onSettled,
  children,
}: {
  custom: SlideCustom
  onSettled: () => void
  children: (pinnedPaneX: MotionValue<number>) => React.ReactNode
}) {
  const x = useMotionValue(0)
  // Negate the slide translate so the pinned pane appears static (spec §18.5).
  const pinnedPaneX = useTransform(x, (v) => -v)
  return (
    <motion.div
      className="absolute inset-0 flex min-h-0 min-w-0 flex-col"
      style={{ x }}
      custom={custom}
      variants={panelVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={slideTransition}
      onAnimationComplete={(definition) => {
        if (definition === 'center') onSettled()
      }}
    >
      {children(pinnedPaneX)}
    </motion.div>
  )
}

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

export type TabStripShellTab = {
  id: string
  label: React.ReactNode
}

export type TabStripShellProps = {
  tabs: TabStripShellTab[]
  /** Resolved active tab id (the parent owns controlled/uncontrolled selection). */
  activeId: string
  onSelectTab: (id: string) => void
  /** Distinct per mounted shell so the sliding indicator doesn't cross instances. */
  indicatorLayoutId: string
  classNames?: TabbedTableClassNames
  /** Stretchy middle region of the strip (e.g. filter badges). */
  centerContent?: React.ReactNode
  /** Right-aligned region of the strip (e.g. actions + column picker). */
  endContent?: React.ReactNode
  /** Render the active panel; receives the negated tab-slide x for the pinned pane. */
  renderPanel: (pinnedPaneX: MotionValue<number>) => React.ReactNode
}

/**
 * The folder-tab strip + sliding-panel chrome shared by `TabbedTable`
 * (shared-dataset) and `IndependentTabbedTable` (separate-tables). Owns the
 * slide direction, mid-slide scrollbar suppression, and panel-width
 * measurement; the panel contents and strip slots are supplied by the parent.
 */
export function TabStripShell({
  tabs,
  activeId,
  onSelectTab,
  indicatorLayoutId,
  classNames,
  centerContent,
  endContent,
  renderPanel,
}: TabStripShellProps) {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeId),
  )
  // Resolve a tab that actually exists: if `activeId` is missing/stale (or the
  // tab list changed under it), fall back to the first tab so a panel always
  // renders — matching the pre-shell `tabs[Math.max(0, findIndex)]` behavior.
  const resolvedActiveId = tabs[activeIndex]?.id

  // ----- Slide direction -----
  const prevRef = useRef({ id: resolvedActiveId, index: activeIndex })
  const dirRef = useRef(1)
  if (prevRef.current.id !== resolvedActiveId) {
    dirRef.current = activeIndex >= prevRef.current.index ? 1 : -1
    prevRef.current = { id: resolvedActiveId, index: activeIndex }
  }
  const direction = dirRef.current

  // Native scrollbars are hidden mid-slide so they don't sweep across the
  // visually-static frozen pane. This must flip synchronously (render-phase
  // update) in the same commit that swaps panels: AnimatePresence freezes the
  // exiting panel's props, so the suppression class lives on the shared
  // panels container instead of the panels themselves.
  const [isSliding, setIsSliding] = useState(false)
  const [slideTracker, setSlideTracker] = useState(resolvedActiveId)
  if (slideTracker !== resolvedActiveId) {
    setSlideTracker(resolvedActiveId)
    setIsSliding(true)
  }
  const handleSlideSettled = useCallback(() => setIsSliding(false), [])

  // ----- Panel width (pixel-based slide so the negation transform is exact) -----
  const panelsRef = useRef<HTMLDivElement | null>(null)
  const [panelWidth, setPanelWidth] = useState(0)
  useIsomorphicLayoutEffect(() => {
    const el = panelsRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setPanelWidth(el.clientWidth))
    observer.observe(el)
    setPanelWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const slideCustom: SlideCustom = { dir: direction, width: panelWidth || 1280 }

  // ----- Horizontal tab-strip scrolling (Excel-style step arrows) -----
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const activeTabRef = useRef<HTMLButtonElement | null>(null)

  // Whether the strip overflows and where it currently sits, so the step
  // arrows can show/hide and disable at the ends.
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
  }, [resolvedActiveId])

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
    <div
      data-tgx-tabbed-table=""
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card',
        classNames?.container,
      )}
    >
      {/* --- Tab strip (folder-tab look, styling guide §1) --- */}
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
              const isActive = tab.id === resolvedActiveId
              return (
                <button
                  key={tab.id}
                  ref={isActive ? activeTabRef : undefined}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
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
        <div className="flex shrink-0 items-center justify-end self-center">
          {centerContent}
        </div>
        {endContent && (
          <div className="flex shrink-0 items-center gap-2 self-center">{endContent}</div>
        )}
      </div>

      {/* --- Sliding tab panels --- */}
      <div
        ref={panelsRef}
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          isSliding && 'tgx-sliding',
          classNames?.panel,
        )}
      >
        <AnimatePresence initial={false} custom={slideCustom}>
          {resolvedActiveId != null && (
            <TabPanel key={resolvedActiveId} custom={slideCustom} onSettled={handleSlideSettled}>
              {(pinnedPaneX) => renderPanel(pinnedPaneX)}
            </TabPanel>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
