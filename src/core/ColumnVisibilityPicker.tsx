import { Columns3Icon } from 'lucide-react'
import { cn } from '../lib/cn'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

export type ColumnVisibilityItem = {
  id: string
  label: string
  visible: boolean
}

type ColumnVisibilityPickerProps = {
  items: ColumnVisibilityItem[]
  onToggle: (id: string, visible: boolean) => void
  onSetAll: (visible: boolean) => void
  className?: string
}

/** Toolbar dropdown listing hideable columns (spec §12). */
export function ColumnVisibilityPicker({
  items,
  onToggle,
  onSetAll,
  className,
}: ColumnVisibilityPickerProps) {
  const hiddenCount = items.filter((i) => !i.visible).length
  const allVisible = hiddenCount === 0
  const allHidden = hiddenCount === items.length
  if (items.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn('shrink-0', className)}>
          <Columns3Icon className="mr-1 size-4" />
          Columns
          {hiddenCount > 0 && (
            <span className="ml-1.5 rounded bg-primary/15 px-1.5 text-xs text-primary tabular-nums">
              {hiddenCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <div className="flex gap-1 px-2 py-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={allVisible}
            onClick={() => onSetAll(true)}
          >
            Show all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={allHidden}
            onClick={() => onSetAll(false)}
          >
            Hide all
          </Button>
        </div>
        <DropdownMenuSeparator />
        <div className="tgx-scrollbar max-h-72 overflow-y-auto">
          {items.map((item) => (
            <DropdownMenuCheckboxItem
              key={item.id}
              checked={item.visible}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) => onToggle(item.id, checked === true)}
            >
              <span className="truncate">{item.label}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
