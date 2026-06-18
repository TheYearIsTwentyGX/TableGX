import { SearchIcon, XIcon } from 'lucide-react'
import { cn } from '../lib/cn'

export type TableSearchInputProps = {
  /** Current query text. */
  value: string
  /** Notified on every keystroke and when the clear button empties the field. */
  onChange: (value: string) => void
  /** Placeholder text. Defaults to "Search…". */
  placeholder?: string
  className?: string
}

/**
 * The global-search text field: a search icon, an input themed to match the
 * toolbar controls, and an "x" clear affordance that appears once there's a
 * query. Used by the single-table toolbar and the `Table.Search` primitive.
 */
export function TableSearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: TableSearchInputProps) {
  return (
    <div data-tgx-search="" className={cn('relative flex shrink-0 items-center', className)}>
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground"
      />
      <input
        type="text"
        role="searchbox"
        aria-label={placeholder}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-8 w-44 min-w-0 rounded-lg border border-input bg-transparent pr-7 pl-7 text-sm transition-colors outline-none',
          'placeholder:text-muted-foreground',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        )}
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-1.5 flex items-center justify-center rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}
