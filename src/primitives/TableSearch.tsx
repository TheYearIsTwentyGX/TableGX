import { TableSearchInput } from '../core/SearchInput'
import { useTableStore } from './store'

export type TableSearchProps = {
  className?: string
}

/**
 * The global-search text field, wired to the store. Renders only when the active
 * tab opts into the built-in search (`enableGlobalSearch`); otherwise nothing.
 * In shared-tabbed mode the query is shared across tabs; in independent-tabbed
 * mode each tab keeps its own.
 */
export function TableSearch({ className }: TableSearchProps) {
  const { search } = useTableStore()
  if (!search) return null
  return (
    <TableSearchInput
      value={search.value}
      onChange={search.onChange}
      placeholder={search.placeholder}
      className={className}
    />
  )
}
