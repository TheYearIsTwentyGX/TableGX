import type {
  Column,
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  Table,
} from '@tanstack/react-table'
import type { Dispatch, MouseEvent, ReactNode, SetStateAction } from 'react'

/** Base constraint for all row types. */
export type TableRowData = Record<string, unknown>

/** Stable, unique per-row id accessor. Drives selection, editing, virtualization keys. */
export type GetRowId<TRow> = (row: TRow) => string | number

/** Editor kind for editable cells. */
export type EditInputType = 'text' | 'number' | 'boolean' | 'select'

/** Injectable text measurer: returns the pixel width of `text` rendered in `font`. */
export type MeasureTextFn = (text: string, font: string) => number

/** Declarative action button rendered inside a cell (see spec §20). */
export type CellActionButton<TRow> = {
  id: string
  /** Label and/or icon. At least one is required; icon-only buttons must set ariaLabel. */
  label?: string
  icon?: ReactNode
  ariaLabel?: string
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive' | 'outline'
  /** Click handler. The implementation stops propagation before invoking. May be async. */
  onClick: (row: TRow, event: MouseEvent) => void | Promise<void>
  isHidden?: (row: TRow) => boolean
  isDisabled?: (row: TRow) => boolean
  /** Optional confirm step before firing onClick (e.g. destructive actions). */
  confirm?: { title: string; description?: string; confirmLabel?: string }
  tooltip?: string
}

/**
 * Arbitrary custom action control rendered inside a cell's action slot. Use for
 * anything the declarative button variant can't express — popover triggers,
 * dropdown menus, etc. The slot click-isolates the rendered control (selection,
 * expand, and edit are never triggered) without consumer cooperation.
 */
export type CellActionCustom<TRow> = {
  id: string
  /** Render any interactive control for this row. */
  render: (row: TRow) => ReactNode
  isHidden?: (row: TRow) => boolean
}

/** A cell action: either a declarative button or a custom-rendered control. Discriminated by the `render` field. */
export type CellAction<TRow> = CellActionButton<TRow> | CellActionCustom<TRow>

export type FooterAggregate = 'sum' | 'avg' | 'min' | 'max' | 'count'

/**
 * Typed context handed to a column's custom cell renderer (`meta.renderCell`)
 * and cell click handler (`meta.onCellClick`). Lets a consumer fully control a
 * cell's content and click behavior with full type information.
 */
export type CellRenderContext<TRow extends TableRowData = TableRowData> = {
  /** The full row record. */
  row: TRow
  /** The cell's accessor value. */
  value: unknown
  /** The column id. */
  columnId: string
  /** The underlying TanStack column instance. */
  column: Column<TRow, unknown>
  /** The owning TanStack table instance. */
  table: Table<TRow>
  /** True only when this exact cell is currently in edit mode (EditableTable). */
  isEditing: boolean
}

/** The single custom per-column metadata contract (spec §5.1). */
export type TableColumnMeta = {
  // --- Editing ---
  editable?: boolean
  inputType?: EditInputType
  selectOptions?: { label: string; value: string }[]

  // --- Auto-sizing hints ---
  /** Returns the underlying string that should be measured for non-text cells. */
  measureText?: (row: TableRowData) => string
  /** Fixed content width (px, excluding cell chrome/padding) used instead of measuring. */
  fixedMeasureWidth?: number
  /** Per-column max-width clamp (px) for auto-sizing. Defaults to the system max. */
  maxColumnWidth?: number

  // --- Footer / totals row ---
  footerAggregate?: FooterAggregate
  footerFormat?: (value: number) => string
  footerLabel?: string

  // --- Cell actions ---
  actions?: CellAction<TableRowData>[]

  // --- Custom rendering & interaction ---
  /**
   * Opt this column's value area out of single-line truncation, giving the
   * column's `cell` renderer full layout control (e.g. multiple badges, wrapping
   * content, interactive controls). Defaults to false (truncated single line).
   * When using custom content, set `measureText` or `fixedMeasureWidth` so
   * auto-sizing can size the column — the raw value is not meaningful here.
   */
  disableTruncate?: boolean
  /**
   * Fully controls a cell's content, taking precedence over the column's
   * TanStack `cell`. The output is rendered in a non-truncating,
   * horizontally-flexible container so multiple inline elements sit side by
   * side instead of being clipped. Because custom content has no inferable
   * text, pair this with `measureText` / `fixedMeasureWidth` / `maxColumnWidth`
   * for correct auto-sizing.
   */
  renderCell?: (ctx: CellRenderContext) => ReactNode
  /**
   * Makes the whole cell clickable (e.g. to open a portaled popover). The
   * implementation isolates the event from row selection / expansion / edit
   * before invoking. On an editable column, opting into this means the cell
   * does NOT also auto-enter inline edit; an actively-editing cell still shows
   * its editor. Use the exported `isolateCellEvent` / `cellInteractionProps`
   * to stop interactive children inside a custom cell from leaking events.
   */
  onCellClick?: (ctx: CellRenderContext, event: MouseEvent) => void
}

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> extends TableColumnMeta {}
}

/** At most one cell is in edit mode at a time (spec §7.5). */
export type EditingState = {
  rowId: string | number
  columnId: string
  initialValue: string
} | null

/** Per-column filter value: combined text search + faceted checklist (spec §10.1). */
export type ColumnFilterValue = {
  text: string
  checkedValues: Set<string> | null
}

/** Column group definition for grouped headers (editable tables). */
export type ColumnGroupDef = {
  id: string
  label: string
  /** Leaf column ids covered by this group, in display order. */
  columnIds: string[]
}

/** Class overrides for every visual region; merged with the defaults via cn(). */
export type TableClassNames = {
  root?: string
  toolbar?: string
  filterBadges?: string
  headerRow?: string
  headerCell?: string
  groupHeaderCell?: string
  bodyRow?: string
  bodyCell?: string
  footerRow?: string
  footerCell?: string
  empty?: string
  skeleton?: string
}

/** Class overrides for the TabbedTable chrome. */
export type TabbedTableClassNames = TableClassNames & {
  container?: string
  tabStrip?: string
  tab?: string
  activeTab?: string
  inactiveTab?: string
  tabIndicator?: string
  panel?: string
}

/** Shared advanced features — everything defaults off (spec §23). */
export type AdvancedFeatureProps<TRow> = {
  enableMultiSort?: boolean
  enableRowSelection?: boolean
  selectedRowIds?: string[]
  onSelectedRowIdsChange?: (ids: string[]) => void
  enableColumnVisibility?: boolean
  columnVisibilityStorageKey?: string
  enableFooter?: boolean
  // Nested rows
  enableExpanding?: boolean
  getSubRows?: (row: TRow) => TRow[] | undefined
  expanded?: Record<string, boolean>
  onExpandedChange?: (next: Record<string, boolean>) => void
  defaultExpanded?: boolean | Record<string, boolean>
}

export type ReadOnlyTableProps<TRow extends TableRowData> = {
  data: TRow[]
  columns: ColumnDef<TRow, unknown>[]
  getRowId: GetRowId<TRow>
  toolbar?: ReactNode
  maxHeight?: string
  emptyMessage?: string
  isLoading?: boolean
  bordered?: boolean
  frozenColumns?: number
  columnFilters?: ColumnFiltersState
  onColumnFiltersChange?: Dispatch<SetStateAction<ColumnFiltersState>>
  initialSorting?: SortingState
  measure?: MeasureTextFn
  /** Human label for a column id (used by filter badges and the visibility picker). */
  columnLabel?: (columnId: string) => string
  classNames?: TableClassNames
} & AdvancedFeatureProps<TRow>

export type SaveEditFn<TRow> = (
  row: TRow,
  columnId: string,
  value: string | number | boolean,
) => Promise<boolean>

export type EditableTableExtraProps<TRow extends TableRowData> = {
  /** Whitelist of columns that may enter edit mode (column must also set meta.editable). */
  editableColumnIds: string[]
  /** Resolve true to commit and close; false keeps the editor open. */
  onSaveEdit: SaveEditFn<TRow>
  isSubmitting?: boolean
  singleClickEdit?: boolean
  columnGroups?: ColumnGroupDef[]
  getCellClassName?: (row: TRow, columnId: string) => string | undefined
}

export type EditableTableProps<TRow extends TableRowData> = ReadOnlyTableProps<TRow> &
  EditableTableExtraProps<TRow>

// --- TabbedTable (spec §18) ---

export type CommonTab<TRow extends TableRowData> = {
  /** Stable tab key. */
  id: string
  /** Button text + filter-badge source label. */
  label: string
  /** Column set shown on this tab. */
  columns: ColumnDef<TRow, unknown>[]
  frozenColumns?: number
  initialSorting?: SortingState
  columnVisibilityStorageKey?: string
  columnLabel?: (columnId: string) => string
}

export type ReadOnlyTab<TRow extends TableRowData> = CommonTab<TRow> & { editable?: false }

export type EditableTab<TRow extends TableRowData> = CommonTab<TRow> & {
  editable: true
  editableColumnIds: string[]
  onSaveEdit: SaveEditFn<TRow>
  columnGroups?: ColumnGroupDef[]
  singleClickEdit?: boolean
  getCellClassName?: (row: TRow, columnId: string) => string | undefined
  isSubmitting?: boolean
}

export type TabbedTableTab<TRow extends TableRowData> = ReadOnlyTab<TRow> | EditableTab<TRow>

export type TabbedTableProps<TRow extends TableRowData> = {
  data: TRow[]
  getRowId: GetRowId<TRow>
  /**
   * Stable column shared by all tabs; drives cross-tab filter intersection.
   * Must be the column getRowId reads.
   */
  idColumn: string
  tabs: TabbedTableTab<TRow>[]
  /** Controlled active tab. */
  activeTabId?: string
  /** Initial active tab when uncontrolled. */
  defaultTabId?: string
  onActiveTabChange?: (id: string) => void
  /** Right-aligned tab-strip controls (refresh/export, etc.). */
  actions?: ReactNode
  emptyMessage?: string
  isLoading?: boolean
  /** Each tab persists column visibility under `${base}:${tab.id}`. */
  columnVisibilityStorageKeyBase?: string
  /** Distinct per mounted TabbedTable so sliding indicators don't cross instances. */
  tabIndicatorLayoutId?: string
  measure?: MeasureTextFn
  classNames?: TabbedTableClassNames
} & Pick<
  AdvancedFeatureProps<TRow>,
  | 'enableMultiSort'
  | 'enableRowSelection'
  | 'selectedRowIds'
  | 'onSelectedRowIdsChange'
  | 'enableColumnVisibility'
  | 'enableFooter'
> &
  Pick<AdvancedFeatureProps<TRow>, 'enableExpanding' | 'getSubRows' | 'defaultExpanded'>
