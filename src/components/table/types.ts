import type { ColumnDef, ColumnFiltersState, SortingState, ExpandedState } from '@tanstack/react-table';

export type TableClassNames = {
  container?: string;
  headerRow?: string;
  headerCell?: string;
  bodyRow?: string;
  bodyCell?: string;
  pinnedDivider?: string;
  tabStrip?: string;
  tabButton?: string;
  tabButtonActive?: string;
  filterPopover?: string;
  scrollContainer?: string;
  tabContentArea?: string;
  injectedBgClass?: string;
};

export type EditInputType = 'text' | 'number' | 'boolean' | 'select';

export type CellAction<TRow> = {
  id: string;
  label?: string;
  icon?: React.ReactNode;
  ariaLabel?: string;
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive' | 'outline';
  onClick: (row: TRow, event: React.MouseEvent) => void | Promise<void>;
  isHidden?: (row: TRow) => boolean;
  isDisabled?: (row: TRow) => boolean;
  confirm?: { title: string; description?: string; confirmLabel?: string };
  tooltip?: string;
};

export type NumberFormatConfig = {
  decimalPlaces?: number;
  thousandSeparator?: boolean;
  negativeFormat?: 'minus' | 'parentheses';
  negativeInRed?: boolean;
};

export type TableColumnMeta<TRow = Record<string, unknown>> = {
  // --- Editing ---
  editable?: boolean;
  inputType?: EditInputType;
  selectOptions?: { label: string; value: string }[];

  // --- Formatting ---
  numberFormat?: NumberFormatConfig;

  // --- Auto-sizing hints ---
  measureText?: (row: TRow) => string;
  fixedMeasureWidth?: number;
  maxColumnWidth?: number;

  // --- Footer / totals row ---
  footerAggregate?: 'sum' | 'avg' | 'min' | 'max' | 'count';
  footerFormat?: (value: number) => string;
  footerLabel?: string;

  // --- Cell actions ---
  actions?: CellAction<TRow>[];
};

export type AdvancedFeatureProps<TRow> = {
  enableMultiSort?: boolean;
  enableRowSelection?: boolean;
  selectedRowIds?: string[];
  onSelectedRowIdsChange?: (ids: string[]) => void;
  enableColumnVisibility?: boolean;
  columnVisibilityStorageKey?: string;
  enableFooter?: boolean;
  // Nested rows
  enableExpanding?: boolean;
  getSubRows?: (row: TRow) => TRow[] | undefined;
  expanded?: ExpandedState;
  onExpandedChange?: (next: ExpandedState) => void;
  defaultExpanded?: boolean | Record<string, boolean>;
};

export type MeasureTextFn = (text: string, font?: string) => number;

export type ReadOnlyTableProps<TRow> = {
  data: TRow[];
  fullData?: TRow[];
  columns: ColumnDef<TRow>[];
  getRowId: (row: TRow) => string | number;
  toolbar?: React.ReactNode;
  maxHeight?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  bordered?: boolean;
  animateScrollOnly?: boolean;
  tabTransitionDirection?: number;
  frozenColumns?: number;
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
  initialSorting?: SortingState;
  measure?: MeasureTextFn;
  classNames?: TableClassNames;
} & AdvancedFeatureProps<TRow>;

export type EditableTableProps<TRow> = ReadOnlyTableProps<TRow> & {
  editableColumnIds: string[];
  onSaveEdit: (row: TRow, columnId: string, value: string | number | boolean) => Promise<boolean>;
  isSubmitting?: boolean;
  singleClickEdit?: boolean;
  getCellClassName?: (row: TRow, columnId: string) => string | undefined;
};

export type CommonTab<TRow> = {
  id: string;
  label: string;
  columns: ColumnDef<TRow>[];
  frozenColumns?: number;
  initialSorting?: SortingState;
  columnVisibilityStorageKey?: string;
  columnLabel?: (columnId: string) => string;
};

export type ReadOnlyTab<TRow> = CommonTab<TRow> & { editable?: false };

export type EditableTab<TRow> = CommonTab<TRow> & {
  editable: true;
  editableColumnIds: string[];
  onSaveEdit: (row: TRow, columnId: string, value: string | number | boolean) => Promise<boolean>;
  singleClickEdit?: boolean;
  getCellClassName?: (row: TRow, columnId: string) => string | undefined;
  isSubmitting?: boolean;
};

export type TabbedTableTab<TRow> = ReadOnlyTab<TRow> | EditableTab<TRow>;

export type TabbedTableProps<TRow> = {
  data: TRow[];
  getRowId: (row: TRow) => string | number;
  idColumn?: string;
  tabs: TabbedTableTab<TRow>[];
  activeTabId?: string;
  defaultTabId?: string;
  onActiveTabChange?: (id: string) => void;
  actions?: React.ReactNode;
  animateScrollOnly?: boolean;
  emptyMessage?: string;
  isLoading?: boolean;
  columnVisibilityStorageKeyBase?: string;
  tabIndicatorLayoutId?: string;
  measure?: MeasureTextFn;
  classNames?: TableClassNames;
} & AdvancedFeatureProps<TRow>;

// Extended meta type override for TanStack Table
import '@tanstack/react-table';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> extends TableColumnMeta<TData> {}
}
