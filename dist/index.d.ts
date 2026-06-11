
import { ColumnDef, ColumnDef as ColumnDef$1, ColumnFiltersState, ColumnFiltersState as ColumnFiltersState$1, FilterFn, SortingState, SortingState as SortingState$1, VisibilityState } from "@tanstack/react-table";
import * as React from "react";
import { Dispatch, MouseEvent, ReactNode, SetStateAction } from "react";
import { ClassValue } from "clsx";

//#region src/types.d.ts
/** Base constraint for all row types. */
type TableRowData = Record<string, unknown>;
/** Stable, unique per-row id accessor. Drives selection, editing, virtualization keys. */
type GetRowId<TRow> = (row: TRow) => string | number;
/** Editor kind for editable cells. */
type EditInputType = 'text' | 'number' | 'boolean' | 'select';
/** Injectable text measurer: returns the pixel width of `text` rendered in `font`. */
type MeasureTextFn = (text: string, font: string) => number;
/** Declarative action button rendered inside a cell (see spec §20). */
type CellAction<TRow> = {
  id: string; /** Label and/or icon. At least one is required; icon-only buttons must set ariaLabel. */
  label?: string;
  icon?: ReactNode;
  ariaLabel?: string;
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive' | 'outline'; /** Click handler. The implementation stops propagation before invoking. May be async. */
  onClick: (row: TRow, event: MouseEvent) => void | Promise<void>;
  isHidden?: (row: TRow) => boolean;
  isDisabled?: (row: TRow) => boolean; /** Optional confirm step before firing onClick (e.g. destructive actions). */
  confirm?: {
    title: string;
    description?: string;
    confirmLabel?: string;
  };
  tooltip?: string;
};
type FooterAggregate = 'sum' | 'avg' | 'min' | 'max' | 'count';
/** The single custom per-column metadata contract (spec §5.1). */
type TableColumnMeta = {
  editable?: boolean;
  inputType?: EditInputType;
  selectOptions?: {
    label: string;
    value: string;
  }[]; /** Returns the underlying string that should be measured for non-text cells. */
  measureText?: (row: TableRowData) => string; /** Fixed content width (px, excluding cell chrome/padding) used instead of measuring. */
  fixedMeasureWidth?: number; /** Per-column max-width clamp (px) for auto-sizing. Defaults to the system max. */
  maxColumnWidth?: number;
  footerAggregate?: FooterAggregate;
  footerFormat?: (value: number) => string;
  footerLabel?: string;
  actions?: CellAction<TableRowData>[];
};
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> extends TableColumnMeta {}
}
/** At most one cell is in edit mode at a time (spec §7.5). */
type EditingState = {
  rowId: string | number;
  columnId: string;
  initialValue: string;
} | null;
/** Per-column filter value: combined text search + faceted checklist (spec §10.1). */
type ColumnFilterValue = {
  text: string;
  checkedValues: Set<string> | null;
};
/** Column group definition for grouped headers (editable tables). */
type ColumnGroupDef = {
  id: string;
  label: string; /** Leaf column ids covered by this group, in display order. */
  columnIds: string[];
};
/** Class overrides for every visual region; merged with the defaults via cn(). */
type TableClassNames = {
  root?: string;
  toolbar?: string;
  filterBadges?: string;
  headerRow?: string;
  headerCell?: string;
  groupHeaderCell?: string;
  bodyRow?: string;
  bodyCell?: string;
  footerRow?: string;
  footerCell?: string;
  empty?: string;
  skeleton?: string;
};
/** Class overrides for the TabbedTable chrome. */
type TabbedTableClassNames = TableClassNames & {
  container?: string;
  tabStrip?: string;
  tab?: string;
  activeTab?: string;
  inactiveTab?: string;
  tabIndicator?: string;
  panel?: string;
};
/** Shared advanced features — everything defaults off (spec §23). */
type AdvancedFeatureProps<TRow> = {
  enableMultiSort?: boolean;
  enableRowSelection?: boolean;
  selectedRowIds?: string[];
  onSelectedRowIdsChange?: (ids: string[]) => void;
  enableColumnVisibility?: boolean;
  columnVisibilityStorageKey?: string;
  enableFooter?: boolean;
  enableExpanding?: boolean;
  getSubRows?: (row: TRow) => TRow[] | undefined;
  expanded?: Record<string, boolean>;
  onExpandedChange?: (next: Record<string, boolean>) => void;
  defaultExpanded?: boolean | Record<string, boolean>;
};
type ReadOnlyTableProps<TRow extends TableRowData> = {
  data: TRow[];
  columns: ColumnDef$1<TRow, unknown>[];
  getRowId: GetRowId<TRow>;
  toolbar?: ReactNode;
  maxHeight?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  bordered?: boolean;
  frozenColumns?: number;
  columnFilters?: ColumnFiltersState$1;
  onColumnFiltersChange?: Dispatch<SetStateAction<ColumnFiltersState$1>>;
  initialSorting?: SortingState$1;
  measure?: MeasureTextFn; /** Human label for a column id (used by filter badges and the visibility picker). */
  columnLabel?: (columnId: string) => string;
  classNames?: TableClassNames;
} & AdvancedFeatureProps<TRow>;
type SaveEditFn<TRow> = (row: TRow, columnId: string, value: string | number | boolean) => Promise<boolean>;
type EditableTableExtraProps<TRow extends TableRowData> = {
  /** Whitelist of columns that may enter edit mode (column must also set meta.editable). */editableColumnIds: string[]; /** Resolve true to commit and close; false keeps the editor open. */
  onSaveEdit: SaveEditFn<TRow>;
  isSubmitting?: boolean;
  singleClickEdit?: boolean;
  columnGroups?: ColumnGroupDef[];
  getCellClassName?: (row: TRow, columnId: string) => string | undefined;
};
type EditableTableProps<TRow extends TableRowData> = ReadOnlyTableProps<TRow> & EditableTableExtraProps<TRow>;
type CommonTab<TRow extends TableRowData> = {
  /** Stable tab key. */id: string; /** Button text + filter-badge source label. */
  label: string; /** Column set shown on this tab. */
  columns: ColumnDef$1<TRow, unknown>[];
  frozenColumns?: number;
  initialSorting?: SortingState$1;
  columnVisibilityStorageKey?: string;
  columnLabel?: (columnId: string) => string;
};
type ReadOnlyTab<TRow extends TableRowData> = CommonTab<TRow> & {
  editable?: false;
};
type EditableTab<TRow extends TableRowData> = CommonTab<TRow> & {
  editable: true;
  editableColumnIds: string[];
  onSaveEdit: SaveEditFn<TRow>;
  columnGroups?: ColumnGroupDef[];
  singleClickEdit?: boolean;
  getCellClassName?: (row: TRow, columnId: string) => string | undefined;
  isSubmitting?: boolean;
};
type TabbedTableTab<TRow extends TableRowData> = ReadOnlyTab<TRow> | EditableTab<TRow>;
type TabbedTableProps<TRow extends TableRowData> = {
  data: TRow[];
  getRowId: GetRowId<TRow>;
  /**
   * Stable column shared by all tabs; drives cross-tab filter intersection.
   * Must be the column getRowId reads.
   */
  idColumn: string;
  tabs: TabbedTableTab<TRow>[]; /** Controlled active tab. */
  activeTabId?: string; /** Initial active tab when uncontrolled. */
  defaultTabId?: string;
  onActiveTabChange?: (id: string) => void; /** Right-aligned tab-strip controls (refresh/export, etc.). */
  actions?: ReactNode;
  emptyMessage?: string;
  isLoading?: boolean; /** Each tab persists column visibility under `${base}:${tab.id}`. */
  columnVisibilityStorageKeyBase?: string; /** Distinct per mounted TabbedTable so sliding indicators don't cross instances. */
  tabIndicatorLayoutId?: string;
  measure?: MeasureTextFn;
  classNames?: TabbedTableClassNames;
} & Pick<AdvancedFeatureProps<TRow>, 'enableMultiSort' | 'enableRowSelection' | 'selectedRowIds' | 'onSelectedRowIdsChange' | 'enableColumnVisibility' | 'enableFooter'> & Pick<AdvancedFeatureProps<TRow>, 'enableExpanding' | 'getSubRows' | 'defaultExpanded'>;
//#endregion
//#region src/components/ReadOnlyTable.d.ts
/** Display-only grid: TableCore with `editable={false}` (spec §4). */
declare function ReadOnlyTable<TRow extends TableRowData>(props: ReadOnlyTableProps<TRow>): import("react").JSX.Element;
//#endregion
//#region src/components/EditableTable.d.ts
/** Inline-editing grid: TableCore with `editable={true}` (spec §4, §7). */
declare function EditableTable<TRow extends TableRowData>(props: EditableTableProps<TRow>): import("react").JSX.Element;
//#endregion
//#region src/components/TabbedTable.d.ts
/**
 * Multiple table views (tabs) over the same rows, with cross-tab filter
 * intersection, shared selection, and a folder-tab strip (spec §18).
 */
declare function TabbedTable<TRow extends TableRowData>(props: TabbedTableProps<TRow>): React.JSX.Element;
//#endregion
//#region src/constants.d.ts
/** Fixed body row height (enables row virtualization). */
declare const ROW_HEIGHT_PX = 56;
/** Header row height. */
declare const HEADER_HEIGHT_PX = 48;
/** Pre-measurement fallback width, used only until auto-sizing resolves. */
declare const MIN_COLUMN_WIDTH_PX = 160;
/** Hard floor so an empty-header column still shows its icons. */
declare const ABSOLUTE_MIN_COLUMN_WIDTH_PX = 48;
/**
 * Auto-sized frozen (pinned) columns are scaled so their combined width does not
 * exceed this fraction of the viewport until the user resizes a pinned data column;
 * after that, pinned columns use their effective widths and the pane may grow wider.
 */
declare const FROZEN_PANE_MAX_FRACTION = 0.5;
/** Horizontal indent applied per nesting depth for the disclosure column. */
declare const INDENT_STEP_PX = 20;
/** System-wide max width for auto-sized columns (per-column override via meta.maxColumnWidth). */
declare const MAX_COLUMN_WIDTH_PX = 480;
//#endregion
//#region src/lib/columns.d.ts
/** Text column: stringifies the value, filterable with the default filter. */
declare function textColumn<TRow extends TableRowData>(id: string, header: string, meta?: TableColumnMeta): ColumnDef$1<TRow, unknown>;
/** Number column: locale-formatted display. */
declare function numberColumn<TRow extends TableRowData>(id: string, header: string, meta?: TableColumnMeta): ColumnDef$1<TRow, unknown>;
/** Boolean column: BodyCell renders the Yes/No checkbox affordance via meta.inputType. */
declare function booleanColumn<TRow extends TableRowData>(id: string, header: string, meta?: TableColumnMeta): ColumnDef$1<TRow, unknown>;
/** Select column: displays the option label matching the value. */
declare function selectColumn<TRow extends TableRowData>(id: string, header: string, options: {
  label: string;
  value: string;
}[], meta?: TableColumnMeta): ColumnDef$1<TRow, unknown>;
/** Date column: timezone-safe MM/dd/yyyy display. */
declare function dateColumn<TRow extends TableRowData>(id: string, header: string, meta?: TableColumnMeta): ColumnDef$1<TRow, unknown>;
/** Badge column: renders the value inside a Badge. */
declare function badgeColumn<TRow extends TableRowData>(id: string, header: string, meta?: TableColumnMeta): ColumnDef$1<TRow, unknown>;
//#endregion
//#region src/lib/cell.d.ts
/**
 * Extracts a cell's editable string value: `String(value)`, or `''` for
 * null/undefined (spec §7.5).
 */
declare function getCellEditValue<TRow extends TableRowData>(row: TRow, columnId: string): string;
//#endregion
//#region src/lib/date.d.ts
/**
 * Parses a date-only value without timezone off-by-one errors.
 * `"YYYY-MM-DD"` strings are interpreted at midnight UTC. Date instances pass
 * through; anything else returns null.
 */
declare function parseDateSafe(value: unknown): Date | null;
/**
 * Formats a date-only value as `MM/dd/yyyy` using UTC fields so the displayed
 * day never shifts with the local timezone.
 */
declare function formatDateSafe(value: unknown): string;
//#endregion
//#region src/lib/aggregates.d.ts
/**
 * Computes a footer aggregate over raw cell values. Numeric aggregates ignore
 * non-numeric values; `count` tallies non-empty values. Returns null when no
 * value participates (so the caller can render nothing).
 */
declare function computeAggregate(kind: FooterAggregate, values: unknown[]): number | null;
//#endregion
//#region src/lib/filtering.d.ts
/** Core predicate shared by the table filterFn and cross-tab intersection. */
declare function matchesFilterValue(cellValue: unknown, filterValue: ColumnFilterValue): boolean;
/**
 * Default column filter: case-insensitive "includes" text search combined with
 * a faceted checklist of exact values (spec §10.1).
 */
declare const tgxFilterFn: FilterFn<TableRowData>;
//#endregion
//#region src/lib/measure.d.ts
/**
 * DOM-free text measurement backed by @chenglou/pretext. `prepare` work is
 * cached per (font, text) pair, so repeated measurements are arithmetic-only.
 */
declare const measureTextWidth: MeasureTextFn;
/** True when canvas-based measurement can run (i.e. not during SSR). */
declare function canMeasureText(): boolean;
//#endregion
//#region src/lib/cn.d.ts
declare function cn(...inputs: ClassValue[]): string;
//#endregion
export { ABSOLUTE_MIN_COLUMN_WIDTH_PX, type AdvancedFeatureProps, type CellAction, type ColumnDef, type ColumnFilterValue, type ColumnFiltersState, type ColumnGroupDef, type CommonTab, type EditInputType, type EditableTab, EditableTable, type EditableTableExtraProps, type EditableTableProps, type EditingState, FROZEN_PANE_MAX_FRACTION, type FooterAggregate, type GetRowId, HEADER_HEIGHT_PX, INDENT_STEP_PX, MAX_COLUMN_WIDTH_PX, MIN_COLUMN_WIDTH_PX, type MeasureTextFn, ROW_HEIGHT_PX, type ReadOnlyTab, ReadOnlyTable, type ReadOnlyTableProps, type SaveEditFn, type SortingState, TabbedTable, type TabbedTableClassNames, type TabbedTableProps, type TabbedTableTab, type TableClassNames, type TableColumnMeta, type TableRowData, type VisibilityState, badgeColumn, booleanColumn, canMeasureText, cn, computeAggregate, dateColumn, formatDateSafe, getCellEditValue, matchesFilterValue, measureTextWidth, numberColumn, parseDateSafe, selectColumn, textColumn, tgxFilterFn };
//# sourceMappingURL=index.d.ts.map