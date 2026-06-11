import { AnimatePresence, motion } from 'framer-motion'
import { XIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

export type FilterBadgeItem = {
  key: string
  label: string
  onClear: () => void
}

type FilterBadgesProps = {
  items: FilterBadgeItem[]
  onClearAll: () => void
  className?: string
}

/** Removable active-filter badges + clear-all (spec §10.2). */
export function FilterBadges({ items, onClearAll, className }: FilterBadgesProps) {
  if (items.length === 0) return null
  return (
    <div
      className={cn('flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5', className)}
      data-tgx-filter-badges=""
    >
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.span
            key={item.key}
            layout
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
          >
            <Badge variant="secondary" className="gap-1 pr-1">
              <span className="max-w-56 truncate">{item.label}</span>
              <button
                type="button"
                aria-label={`Clear filter: ${item.label}`}
                className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                onClick={item.onClear}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          </motion.span>
        ))}
      </AnimatePresence>
      {items.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={onClearAll}
        >
          Clear all
        </Button>
      )}
    </div>
  )
}

/** Builds a human-readable badge description for a ColumnFilterValue. */
export function describeFilterValue(value: {
  text?: string
  checkedValues?: Set<string> | null
}): string {
  const parts: string[] = []
  if (value.text) parts.push(`"${value.text}"`)
  if (value.checkedValues) parts.push(`${value.checkedValues.size} selected`)
  return parts.join(', ')
}
