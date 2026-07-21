// Components
export { ReadOnlyTable } from './components/ReadOnlyTable'
export { EditableTable } from './components/EditableTable'
export { TabbedTable } from './components/TabbedTable'
export { TableGX } from './components/TableGX'
export type {
  TableGXProps,
  TableGXTableVariantProps,
  TableGXTabbedVariantProps,
  TableGXIndependentVariantProps,
} from './components/TableGX'
export {
  IndependentTabbedTable,
  independentTable,
  type IndependentTab,
  type IndependentTabbedTableProps,
} from './components/IndependentTabbedTable'

// Compound table primitives (headless store + slot components)
export {
  Table,
  TableProvider,
  useTableStore,
  TableContainer,
  TableTabStrip,
  TablePanels,
  TableBody,
  TableToolbar,
  TableFilterBadges,
  TableSortControl,
  TableSearch,
  TableColumnVisibility,
  TableRecordCount,
} from './primitives'
export type {
  TableProviderProps,
  TableContainerProps,
  TableTabStripProps,
  TableToolbarProps,
  TableFilterBadgesProps,
  TableSortControlProps,
  TableSearchProps,
  TableColumnVisibilityProps,
  TableRecordCountProps,
  TableMode,
  TableBodyRenderArgs,
  TableTabModel,
  TableProviderConfig,
  TableStore,
  FilterChromeApi,
  SharedFilterSource,
} from './primitives'

// Layout constants
export {
  ROW_HEIGHT_PX,
  HEADER_HEIGHT_PX,
  MIN_COLUMN_WIDTH_PX,
  ABSOLUTE_MIN_COLUMN_WIDTH_PX,
  FROZEN_PANE_MAX_FRACTION,
  INDENT_STEP_PX,
  MAX_COLUMN_WIDTH_PX,
} from './constants'

// Re-exported TanStack types used by the public API
export type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table'

// Types
export type {
  TableRowData,
  GetRowId,
  EditInputType,
  MeasureTextFn,
  CellAction,
  CellActionButton,
  CellActionCustom,
  CellRenderContext,
  FooterAggregate,
  TableColumnMeta,
  EditingState,
  ColumnFilterValue,
  ColumnGroupDef,
  LoadingSkeleton,
  RecordCountPosition,
  RecordCountInfo,
  RecordCountLabel,
  TabColumnPreviewPosition,
  TableClassNames,
  TabbedTableClassNames,
  AdvancedFeatureProps,
  ReadOnlyTableProps,
  EditableTableProps,
  EditableTableExtraProps,
  TableGXTableProps,
  SaveEditFn,
  CommonTab,
  ReadOnlyTab,
  EditableTab,
  TabbedTableTab,
  TabbedTableProps,
  IndependentTabBase,
  ReadOnlyIndependentTab,
  EditableIndependentTab,
  IndependentTabConfig,
  ColumnAccessMap,
} from './types'

// Column factory helpers
export {
  textColumn,
  numberColumn,
  booleanColumn,
  selectColumn,
  dateColumn,
  badgeColumn,
  customColumn,
} from './lib/columns'

// Custom cell rendering & interaction primitives
export { CellOverflowList } from './core/CellOverflowList'
export type { CellOverflowListProps } from './core/CellOverflowList'
export { isolateCellEvent, cellInteractionProps } from './lib/isolate'

// Utilities
export { getColumnId } from './hooks/useAutoColumnWidths'
export { getCellEditValue } from './lib/cell'
export { formatDateSafe, parseDateSafe } from './lib/date'
export { computeAggregate } from './lib/aggregates'
export { tgxFilterFn, matchesFilterValue, tgxGlobalFilterFn, matchesGlobalSearch } from './lib/filtering'
export { measureTextWidth, canMeasureText } from './lib/measure'
export { cn } from './lib/cn'
