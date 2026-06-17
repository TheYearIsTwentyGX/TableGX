import { SortHierarchyPicker } from '../core/SortHierarchyPicker'
import { useTableStore } from './store'

export type TableSortControlProps = {
  className?: string
}

/**
 * The shared multi-column sort-hierarchy popover, wired to the store. Renders
 * only when the store exposes a sort control (shared mode with the hierarchy
 * enabled); otherwise nothing.
 */
export function TableSortControl({ className }: TableSortControlProps) {
  const { sortControl } = useTableStore()
  if (!sortControl) return null
  return (
    <SortHierarchyPicker
      sorting={sortControl.sorting}
      resolveLabel={sortControl.resolveLabel}
      onChange={sortControl.onChange}
      className={className}
    />
  )
}
