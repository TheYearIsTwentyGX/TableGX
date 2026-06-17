import { ColumnVisibilityPicker } from '../core/ColumnVisibilityPicker'
import { useTableStore } from './store'

export type TableColumnVisibilityProps = {
  className?: string
}

/**
 * The column-visibility picker for the active tab, wired to the store. Renders
 * nothing when the active tab exposes no hideable columns.
 */
export function TableColumnVisibility({ className }: TableColumnVisibilityProps) {
  const { pickerItems, togglePickerItem, setAllPickerItems } = useTableStore()
  if (pickerItems.length === 0) return null
  return (
    <ColumnVisibilityPicker
      items={pickerItems}
      onToggle={togglePickerItem}
      onSetAll={setAllPickerItems}
      className={className}
    />
  )
}
