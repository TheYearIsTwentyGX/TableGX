import { ListFilterIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '../lib/cn'
import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import type { ColumnFilterValue } from '../types'

const ITEM_HEIGHT_PX = 28
const LIST_MAX_HEIGHT_PX = ITEM_HEIGHT_PX * 8
const LIST_OVERSCAN = 5

type FilterPopoverProps = {
  columnLabel: string
  value: ColumnFilterValue | undefined
  /** Lazily computes the column's unique values; only invoked while open. */
  getUniqueValues: () => string[]
  onChange: (next: ColumnFilterValue | undefined) => void
}

function normalize(next: ColumnFilterValue, allValues: string[]): ColumnFilterValue | undefined {
  let checked = next.checkedValues
  if (checked && checked.size === allValues.length) checked = null
  if (!next.text && checked === null) return undefined
  return { text: next.text, checkedValues: checked }
}

/**
 * Per-column filter popover: text search + virtualized faceted checklist
 * (spec §10.1).
 */
export function FilterPopover({
  columnLabel,
  value,
  getUniqueValues,
  onChange,
}: FilterPopoverProps) {
  const [open, setOpen] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)

  const text = value?.text ?? ''
  const checkedValues = value?.checkedValues ?? null
  const isActive = value !== undefined && (text !== '' || checkedValues !== null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const uniqueValues = useMemo(() => (open ? getUniqueValues() : []), [open, getUniqueValues])

  const visibleValues = useMemo(() => {
    if (!text) return uniqueValues
    const needle = text.toLowerCase()
    return uniqueValues.filter((v) => v.toLowerCase().includes(needle))
  }, [uniqueValues, text])

  const update = (partial: Partial<ColumnFilterValue>) => {
    onChange(normalize({ text, checkedValues, ...partial }, uniqueValues))
  }

  const isChecked = (v: string) => (checkedValues === null ? true : checkedValues.has(v))

  const toggleValue = (v: string) => {
    const next = new Set(checkedValues === null ? uniqueValues : checkedValues)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    update({ checkedValues: next })
  }

  // Manual windowing — unique value lists can be huge.
  const total = visibleValues.length
  const listHeight = Math.min(total * ITEM_HEIGHT_PX, LIST_MAX_HEIGHT_PX)
  const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT_PX) - LIST_OVERSCAN)
  const end = Math.min(
    total,
    Math.ceil((scrollTop + LIST_MAX_HEIGHT_PX) / ITEM_HEIGHT_PX) + LIST_OVERSCAN,
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(
            'size-6 text-muted-foreground hover:text-foreground',
            isActive && 'text-primary hover:text-primary',
          )}
          aria-label={`Filter ${columnLabel}`}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <ListFilterIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-60 origin-top-left p-3"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <Input
            autoFocus
            value={text}
            placeholder={`Search ${columnLabel.toLowerCase()}…`}
            className="h-8 pr-7 text-xs"
            onChange={(e) => update({ text: e.target.value })}
          />
          {text !== '' && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => update({ text: '' })}
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>

        <ButtonGroup className="mb-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => update({ checkedValues: null })}
          >
            Select all
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => update({ checkedValues: new Set<string>() })}
          >
            Deselect all
          </Button>
        </ButtonGroup>

        {total === 0 ? (
          <div className="px-1 py-2 text-xs text-muted-foreground">No values</div>
        ) : (
          <div
            className="tgx-scrollbar overflow-y-auto"
            style={{ maxHeight: LIST_MAX_HEIGHT_PX, height: listHeight }}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            <div className="relative" style={{ height: total * ITEM_HEIGHT_PX }}>
              {visibleValues.slice(start, end).map((v, i) => {
                const index = start + i
                return (
                  <label
                    key={v}
                    className="absolute right-0 left-0 flex cursor-pointer items-center gap-2 rounded px-1 text-sm hover:bg-muted/60"
                    style={{ top: index * ITEM_HEIGHT_PX, height: ITEM_HEIGHT_PX }}
                  >
                    <Checkbox checked={isChecked(v)} onCheckedChange={() => toggleValue(v)} />
                    <span className="truncate">{v === '' ? '(empty)' : v}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-2 flex justify-end border-t pt-2">
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => setOpen(false)}>
            OK
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
