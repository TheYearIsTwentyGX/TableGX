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
        <div className="flex shrink-0 items-end">
          {tabs.map((tab) => {
            const isActive = tab.id === resolvedActiveId
            return (
              <button
                key={tab.id}
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
        {/* --- Stretchy middle slot (e.g. filter badges), inline in the strip --- */}
        <div className="flex min-w-0 flex-1 items-center justify-end self-center overflow-hidden">
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
