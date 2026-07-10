import { EyeOffIcon, SearchIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '../lib/cn'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import type { ColumnJumpEntry } from '../types'

export type ColumnJumpDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: ColumnJumpEntry[]
  onSelect: (entry: ColumnJumpEntry) => void
  className?: string
}

function entryKey(entry: ColumnJumpEntry): string {
  return `${entry.tabId ?? ''}:${entry.columnId}`
}

/**
 * Ctrl+G / Cmd+G "jump to column" dialog: type-to-filter list, Up/Down + Enter
 * to select, click to select directly. Rendered by `TableCore` (see
 * `enableColumnJump`); the merged own-tab + foreign-tab entry list and the
 * cross-tab switch are the caller's responsibility.
 */
export function ColumnJumpDialog({
  open,
  onOpenChange,
  entries,
  onSelect,
  className,
}: ColumnJumpDialogProps) {
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setHighlighted(0)
  }, [open])

  const showTabBadge = useMemo(
    () => new Set(entries.map((e) => e.tabId ?? '')).size > 1,
    [entries],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q ? entries.filter((e) => e.label.toLowerCase().includes(q)) : entries
    return [...matches].sort((a, b) => a.label.localeCompare(b.label))
  }, [entries, query])

  useEffect(() => {
    setHighlighted((prev) => Math.min(prev, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  const select = (entry: ColumnJumpEntry) => {
    onSelect(entry)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-sm', className)}>
        <DialogTitle className="sr-only">Jump to column</DialogTitle>
        <DialogDescription className="sr-only">
          Search for a column by name and press Enter to jump to it.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to column…"
            className="h-7 border-none px-0 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlighted((prev) => Math.min(prev + 1, filtered.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlighted((prev) => Math.max(prev - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const entry = filtered[highlighted]
                if (entry) select(entry)
              }
            }}
          />
        </div>
        <div className="tgx-scrollbar max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No columns match
            </p>
          ) : (
            filtered.map((entry, index) => (
              <button
                key={entryKey(entry)}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  index === highlighted
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/60',
                )}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => select(entry)}
              >
                <span className="flex-1 truncate">{entry.label}</span>
                {entry.hidden && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <EyeOffIcon aria-hidden className="size-3.5" />
                    <span className="sr-only">Hidden</span>
                  </span>
                )}
                {showTabBadge && entry.tabId !== undefined && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {entry.tabLabel}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
