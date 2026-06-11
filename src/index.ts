// Components
export { ReadOnlyTable } from './components/ReadOnlyTable'
export { EditableTable } from './components/EditableTable'
export { TabbedTable } from './components/TabbedTable'

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
  FooterAggregate,
  TableColumnMeta,
  EditingState,
  ColumnFilterValue,
  ColumnGroupDef,
  TableClassNames,
  TabbedTableClassNames,
  AdvancedFeatureProps,
  ReadOnlyTableProps,
  EditableTableProps,
  EditableTableExtraProps,
  SaveEditFn,
  CommonTab,
  ReadOnlyTab,
  EditableTab,
  TabbedTableTab,
  TabbedTableProps,
} from './types'

// Column factory helpers
export {
  textColumn,
  numberColumn,
  booleanColumn,
  selectColumn,
  dateColumn,
  badgeColumn,
} from './lib/columns'

// Utilities
export { getCellEditValue } from './lib/cell'
export { formatDateSafe, parseDateSafe } from './lib/date'
export { computeAggregate } from './lib/aggregates'
export { tgxFilterFn, matchesFilterValue } from './lib/filtering'
export { measureTextWidth, canMeasureText } from './lib/measure'
export { cn } from './lib/cn'
