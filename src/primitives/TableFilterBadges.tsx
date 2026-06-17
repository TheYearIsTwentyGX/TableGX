import { cn } from '../lib/cn'
import { FilterBadges } from '../core/FilterBadges'
import { useTableStore } from './store'

export type TableFilterBadgesProps = {
  className?: string
}

/**
 * The removable active-filter badge strip, wired to the store. In shared mode it
 * shows every tab's filters; in independent mode only the active tab's.
 */
export function TableFilterBadges({ className }: TableFilterBadgesProps) {
  const { filterBadges, clearAllFilters, classNames } = useTableStore()
  return (
    <FilterBadges
      items={filterBadges}
      onClearAll={clearAllFilters}
      className={cn('flex-nowrap border-b-0 p-0', classNames?.filterBadges, className)}
    />
  )
}
