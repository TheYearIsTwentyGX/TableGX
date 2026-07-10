import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import type { TabColumnPreviewPosition } from '../types'
import { Tooltip, TooltipArrow, TooltipContent, TooltipTrigger } from '../ui/tooltip'

type TabColumnPreviewProps = {
  /** Alphabetized column labels for the wrapped tab; empty disables the popover. */
  labels: string[]
  /** Hover/focus delay (ms) before the popover opens. */
  delayMs: number
  /** Where the popover opens relative to the tab. 'auto' lets it flip to fit the viewport. */
  position: TabColumnPreviewPosition
  className?: string
  /** The tab button to attach the hover trigger to. */
  children: ReactNode
}

/**
 * Wraps a tab button with a hover/focus-triggered popover listing that tab's
 * columns. Uses Radix Tooltip (not Popover) since it natively supports a
 * configurable open delay; `asChild` on the trigger keeps the button's own
 * click handler, ref, and markup untouched. Must render inside a single
 * shared `TooltipProvider` (see `TableTabStrip`) so Radix's skip-delay
 * behavior applies across tabs — hopping between tabs while a preview is
 * open, or shortly after one closes, skips the hover delay.
 */
export function TabColumnPreview({
  labels,
  delayMs,
  position,
  className,
  children,
}: TabColumnPreviewProps) {
  if (labels.length === 0) return children

  const side = position === 'above' ? 'top' : 'bottom'
  const avoidCollisions = position === 'auto'

  return (
    <Tooltip delayDuration={delayMs}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align="start"
        sideOffset={8}
        avoidCollisions={avoidCollisions}
        className={cn(
          'w-56 rounded-lg bg-popover p-1.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10',
          className,
        )}
      >
        <div className="tgx-scrollbar max-h-72 overflow-y-auto">
          {labels.map((label, i) => (
            <div key={`${label}-${i}`} title={label} className="truncate px-1 py-0.5">
              {label}
            </div>
          ))}
        </div>
        <TooltipArrow width={12} height={6} className="fill-popover" />
      </TooltipContent>
    </Tooltip>
  )
}
