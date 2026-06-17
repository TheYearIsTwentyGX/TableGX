import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect'
import { cn } from '../lib/cn'
import { useTableStore } from './store'

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
  children: (pinnedPaneX: MotionValue<number>) => ReactNode
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

/**
 * The sliding tab-panel host: renders the active tab's body inside a
 * framer-motion slide, suppressing native scrollbars mid-slide and feeding the
 * negated pane translate down so the frozen pane appears static. Pair with
 * `TableTabStrip`; for a plain (no-tab) table use `TableBody` instead so this
 * animation code is never pulled in.
 */
export function TablePanels() {
  const { tabs, activeId, classNames, activeTab, getBodyArgs } = useTableStore()

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeId),
  )
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
  // update) in the same commit that swaps panels.
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
            {(pinnedPaneX) => activeTab?.render(getBodyArgs(pinnedPaneX)) ?? null}
          </TabPanel>
        )}
      </AnimatePresence>
    </div>
  )
}
