import type { SortingState } from '@tanstack/react-table'
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XIcon,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

export type SortHierarchyPickerProps = {
  /** The shared multi-column sort, in priority order. */
  sorting: SortingState
  /** Readable label for a column id, resolved across all tabs. */
  resolveLabel: (columnId: string) => string
  /** Replaces the whole sort with `next` (priority = array order). */
  onChange: (next: SortingState) => void
  className?: string
}

/**
 * Toolbar popover that exposes the shared multi-column sort hierarchy: flip a
 * column's direction, remove it, or reorder its priority. Uses the popover
 * primitive (not the dropdown menu) so it stays open across edits.
 */
export function SortHierarchyPicker({
  sorting,
  resolveLabel,
  onChange,
  className,
}: SortHierarchyPickerProps) {
  const count = sorting.length

  const flip = (index: number) =>
    onChange(sorting.map((s, i) => (i === index ? { ...s, desc: !s.desc } : s)))

  const remove = (index: number) => onChange(sorting.filter((_, i) => i !== index))

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= sorting.length) return
    const next = sorting.slice()
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    onChange(next)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('shrink-0', className)}
          aria-label="Manage sort order"
        >
          <ArrowUpDownIcon className="mr-1 size-4" />
          Sort
          {count > 0 && (
            <span className="ml-1.5 rounded bg-primary/15 px-1.5 text-xs text-primary tabular-nums">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="px-0.5 text-xs font-medium text-muted-foreground">Sort priority</div>
        {count === 0 ? (
          <div className="px-0.5 py-1.5 text-sm text-muted-foreground">
            No active sort. Click a column header to sort.
          </div>
        ) : (
          <ol className="flex flex-col gap-1">
            {sorting.map((entry, index) => {
              const label = resolveLabel(entry.id)
              const dir = entry.desc ? 'descending' : 'ascending'
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-1 rounded-md bg-muted/40 py-1 pr-1 pl-1.5"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-semibold text-primary tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={label}>
                    {label}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => flip(index)}
                    aria-label={`${label} sorted ${dir}, flip direction`}
                  >
                    {entry.desc ? <ArrowDownIcon /> : <ArrowUpIcon />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${label} earlier in sort priority`}
                  >
                    <ChevronUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => move(index, 1)}
                    disabled={index === count - 1}
                    aria-label={`Move ${label} later in sort priority`}
                  >
                    <ChevronDownIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(index)}
                    aria-label={`Remove ${label} from sort`}
                  >
                    <XIcon />
                  </Button>
                </li>
              )
            })}
          </ol>
        )}
        <p className="border-t border-border/60 px-0.5 pt-2 text-xs text-muted-foreground">
          Tip: Shift-click a column header to add it to the sort.
        </p>
      </PopoverContent>
    </Popover>
  )
}
