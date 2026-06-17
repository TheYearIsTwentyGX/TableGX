// Headless store + context
export { TableProvider, useTableStore } from './store'
export type { TableProviderProps } from './store'

// Compound / slot primitives
export { TableContainer } from './TableContainer'
export type { TableContainerProps } from './TableContainer'
export { TableTabStrip } from './TableTabStrip'
export type { TableTabStripProps } from './TableTabStrip'
export { TablePanels } from './TablePanels'
export { TableBody } from './TableBody'
export { TableToolbar } from './TableToolbar'
export type { TableToolbarProps } from './TableToolbar'
export { TableFilterBadges } from './TableFilterBadges'
export type { TableFilterBadgesProps } from './TableFilterBadges'
export { TableSortControl } from './TableSortControl'
export type { TableSortControlProps } from './TableSortControl'
export { TableColumnVisibility } from './TableColumnVisibility'
export type { TableColumnVisibilityProps } from './TableColumnVisibility'
export { TableRecordCount } from './TableRecordCount'
export type { TableRecordCountProps } from './TableRecordCount'

// Shared types
export type {
  TableMode,
  TableBodyRenderArgs,
  TableTabModel,
  TableProviderConfig,
  TableStore,
  FilterChromeApi,
  SharedFilterSource,
} from './types'

import { TableProvider } from './store'
import { TableContainer } from './TableContainer'
import { TableTabStrip } from './TableTabStrip'
import { TablePanels } from './TablePanels'
import { TableBody } from './TableBody'
import { TableToolbar } from './TableToolbar'
import { TableFilterBadges } from './TableFilterBadges'
import { TableSortControl } from './TableSortControl'
import { TableColumnVisibility } from './TableColumnVisibility'
import { TableRecordCount } from './TableRecordCount'

/**
 * Namespaced access to the compound table primitives. The high-level `TableGX`
 * facade attaches to this same family, so consumers can drop down to the slots
 * (`Table.Provider`, `Table.TabStrip`, `Table.Panels`, …) for full control over
 * chrome layout without leaving the library's conventions.
 */
export const Table = {
  Provider: TableProvider,
  Container: TableContainer,
  TabStrip: TableTabStrip,
  Panels: TablePanels,
  Body: TableBody,
  Toolbar: TableToolbar,
  FilterBadges: TableFilterBadges,
  SortControl: TableSortControl,
  ColumnVisibility: TableColumnVisibility,
  RecordCount: TableRecordCount,
} as const
