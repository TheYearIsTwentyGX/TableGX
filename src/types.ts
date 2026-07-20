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
  /**
   * Returns the exact content width (px, excluding cell chrome/padding) for this
   * column's cell on a given row. Use when a custom cell's width is not a
   * function of any text — a sparkline, a variable set of chips, an image grid —
   * so neither `measureText` nor `fixedMeasureWidth` fits. Takes precedence over
   * both: auto-sizing evaluates it across the same sampled rows and takes the
   * widest. The returned number is treated as the exact content width — cell
   * padding is still added, but no text safety margin is applied, so the
   * consumer owns the value.
   */
  measureWidth?: (row: TableRowData) => number
  /** Per-column max-width clamp (px) for auto-sizing. Defaults to the system max. */
  maxColumnWidth?: number

  // --- Footer / totals row ---
  footerAggregate?: FooterAggregate
  footerFormat?: (value: number) => string
  footerLabel?: string

  // --- Cell actions ---
  actions?: CellAction<TableRowData>[]

  // --- Global search ---
  /**
   * Opt this column out of the built-in global search bar. Defaults to true
   * (searched). Ignored when the table is given an explicit `searchableColumns`
   * list, which takes precedence over per-column flags.
   */
  searchable?: boolean

  // --- Custom rendering & interaction ---
  /**
   * Opt this column's value area out of single-line truncation, giving the
   * column's `cell` renderer full layout control (e.g. multiple badges, wrapping
   * content, interactive controls). Defaults to false (truncated single line).
   * When using custom content, set `measureText`, `fixedMeasureWidth`, or
   * `measureWidth` so auto-sizing can size the column — the raw value is not
   * meaningful here.
   */
  disableTruncate?: boolean
  /**
   * Fully controls a cell's content, taking precedence over the column's
   * TanStack `cell`. The output is rendered in a non-truncating,
   * horizontally-flexible container so multiple inline elements sit side by
   * side instead of being clipped. Because custom content has no inferable
   * text, pair this with `measureText` / `fixedMeasureWidth` / `measureWidth` /
   * `maxColumnWidth` for correct auto-sizing.
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

/**
 * Custom loading skeleton: either static markup, or a render function that
 * receives the computed visible column widths (the same `widths` the built-in
 * skeleton uses) so a custom skeleton can mirror the grid layout if desired.
 */
export type LoadingSkeleton = ReactNode | ((widths: number[]) => ReactNode)

/** Where an opt-in record count renders relative to the table body. */
export type RecordCountPosition = 'top' | 'bottom'

/** Where the tab column-preview popover opens relative to the tab strip. */
export type TabColumnPreviewPosition = 'above' | 'below' | 'auto'

/** Leaf-row counts handed to a record-count label override. */
export type RecordCountInfo = {
  /** Leaf rows after the active filters are applied. */
  filtered: number
  /** Total leaf rows ignoring filters. */
  total: number
  /** True only when the active filters narrow the set (`filtered < total`). */
  isFiltered: boolean
}

/** Override for the record-count display text/markup. */
export type RecordCountLabel = (info: RecordCountInfo) => ReactNode

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
  /** The opt-in record-count region (top toolbar/tab-strip count or bottom floated corner annotation). */
  recordCount?: string
  /** The Ctrl+G "jump to column" dialog (see `enableColumnJump`). */
  columnJumpDialog?: string
  /** The cell-action confirmation dialog (see `CellAction.confirm`). */
  confirmDialog?: string
}

/** Class overrides for the TabbedTable chrome. */
export type TabbedTableClassNames = TableClassNames & {
  container?: string
  tabStrip?: string
  tab?: string
  activeTab?: string
  inactiveTab?: string
  tabIndicator?: string
  /** The Excel-style step arrows shown when the tab strip overflows. */
  tabScrollButton?: string
  /** The hover popover listing a tab's columns (see `enableTabColumnPreview`). */
  tabColumnPreview?: string
  panel?: string
}

/**
 * Body row height.
 *
 * - unset (default): fixed 56px rows — identical behavior and performance to
 *   prior versions.
 * - `number`: a uniform fixed pixel height for every row.
 * - `(row) => number`: an explicit per-row pixel height.
 * - `'auto'`: content-driven height — cells wrap instead of clipping to a single
 *   line, with the fixed 56px height acting as a minimum floor.
 */
export type RowHeight<TRow> = number | 'auto' | ((row: TRow) => number)

/** Shared advanced features — everything defaults off (spec §23). */
export type AdvancedFeatureProps<TRow> = {
  enableMultiSort?: boolean
  enableRowSelection?: boolean
  selectedRowIds?: string[]
  onSelectedRowIdsChange?: (ids: string[]) => void
  enableColumnVisibility?: boolean
  columnVisibilityStorageKey?: string
  /**
   * Ctrl+G / Cmd+G opens a searchable "jump to column" dialog; selecting an
   * entry scrolls that column into view (and, in a tabbed table, switches to
   * the tab that renders it). Off by default.
   */
  enableColumnJump?: boolean
  /**
   * Whether hidden columns appear in the jump list. Selecting a hidden column
   * un-hides it. Default true.
   */
  columnJumpIncludeHidden?: boolean
  /**
   * Opt out of scoping the Ctrl+G / Cmd+G shortcut to this table: when true,
   * it opens the jump dialog regardless of mouse position or focus, as long
   * as this table is mounted. Off by default, meaning the shortcut only
   * fires while the mouse is hovering this table or focus is already inside
   * it. If more than one mounted table sets this, all of them respond to
   * the same keypress — only enable it when you know at most one table with
   * `enableColumnJump` is mounted at a time.
   */
  columnJumpGlobalShortcut?: boolean
  /**
   * Row virtualization. On by default. Set false to render every row in normal
   * document flow instead of a sliding virtual window — useful for small tables
   * where you want browser find-in-page (Ctrl+F), printing, screen-reader access
   * to all rows, or simpler DOM snapshots. This is a "small table" escape hatch
   * and may be slow on large datasets.
   */
  enableRowVirtualization?: boolean
  /**
   * Column virtualization of the scrollable pane. On by default. Set false to
   * render every scrollable column at once instead of a sliding horizontal
   * window. Frozen/pinned columns are never virtualized either way. Same
   * "small table" escape hatch caveat as {@link enableRowVirtualization}.
   */
  enableColumnVirtualization?: boolean
  /**
   * Body row height. Default (unset) keeps fixed 56px rows — identical behavior
   * and performance to prior versions.
   *
   * - `number` / `(row) => number`: explicit fixed/per-row pixel heights. These
   *   feed the row virtualizer directly (no DOM measurement), so virtualization
   *   stays fully performant in both the virtualized and non-virtualized paths.
   * - `'auto'`: rows grow to fit their content (cells wrap instead of clipping
   *   to a single line) with a 56px minimum floor. Auto rows render every
   *   scrollable column (column virtualization does not apply); row
   *   virtualization is supported via dynamic measurement.
   */
  rowHeight?: RowHeight<TRow>
  enableFooter?: boolean
  /**
   * Show a built-in global search bar — a single text input that filters rows
   * by a case-insensitive "includes" match across all searched columns at once
   * (distinct from the per-column filter popovers). Off by default. Combines
   * with active per-column filters and sorting. In single-table mode the input
   * renders in the toolbar before the sort/columns/record-count cluster; in
   * tabbed modes it renders in the tab strip between the tabs and the end
   * controls and applies to the active tab's rows.
   */
  enableGlobalSearch?: boolean
  /** Controlled global-search query. When set, pair with {@link onGlobalSearchChange}. */
  globalSearch?: string
  /** Notified when the global-search query changes (controlled or uncontrolled). */
  onGlobalSearchChange?: (value: string) => void
  /**
   * Restrict global search to these column ids. When provided it takes
   * precedence over per-column `meta.searchable` flags; otherwise every visible
   * non-selection column is searched unless it sets `meta.searchable: false`.
   */
  searchableColumns?: string[]
  /** Placeholder for the global-search input. Defaults to "Search…". */
  searchPlaceholder?: string
  /**
   * Show an opt-in count of the table's rows. Off by default. When a filter
   * narrows the set it reads "Showing X of Y" (filtered leaf rows vs. total
   * leaf rows); otherwise a single total (e.g. "1,234 rows").
   */
  enableRecordCount?: boolean
  /** Where the record count renders: `'top'` (right of the toolbar, after the Columns button) or `'bottom'` (annotation floated at the table's bottom-right corner). Default `'top'`. */
  recordCountPosition?: RecordCountPosition
  /** Override the record-count text/markup; receives the filtered/total leaf counts. */
  recordCountLabel?: RecordCountLabel
  // Nested rows
  enableExpanding?: boolean
  getSubRows?: (row: TRow) => TRow[] | undefined
  expanded?: Record<string, boolean>
  onExpandedChange?: (next: Record<string, boolean>) => void
  defaultExpanded?: boolean | Record<string, boolean>
}

/**
 * Internal — one row of the Ctrl+G "jump to column" dialog (see
 * `AdvancedFeatureProps.enableColumnJump`). Not exported publicly; `tabId` /
 * `tabLabel` are set only for entries belonging to a different tab than the
 * one currently rendering the dialog.
 */
export type ColumnJumpEntry = {
  columnId: string
  label: string
  hidden: boolean
  tabId?: string
  tabLabel?: ReactNode
}

export type ReadOnlyTableProps<TRow extends TableRowData> = {
  data: TRow[]
  columns: ColumnDef<TRow, unknown>[]
  getRowId: GetRowId<TRow>
  toolbar?: ReactNode
  maxHeight?: string
  emptyMessage?: string
  isLoading?: boolean
  /**
   * Custom skeleton rendered in the scroll area while `isLoading` is true,
   * replacing the built-in `TableSkeleton`. Accepts static markup, or a render
   * function receiving the computed visible column widths so it can mirror the
   * grid layout. When omitted, the default skeleton is used.
   */
  loadingSkeleton?: LoadingSkeleton
  bordered?: boolean
  frozenColumns?: number
  columnFilters?: ColumnFiltersState
  onColumnFiltersChange?: Dispatch<SetStateAction<ColumnFiltersState>>
  initialSorting?: SortingState
  measure?: MeasureTextFn
  /**
   * When true (default), the header label plus its sort/filter affordances act
   * as a floor on each column's auto-sized width. Set false to drive width
   * purely from data-cell content (the header may then clip and its icons fall
   * back to an overlay). Not a user-facing toggle — a build-time prop.
   */
  includeHeaderInAutosize?: boolean
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

/**
 * Props for `TableGX`'s single-table variant. Unifies read-only and editable
 * into one surface: a state-controlled `editable` boolean flips the table
 * between display-only and inline-editing live (no remount). Because the
 * discriminated union can't enforce the editable-only props against a runtime
 * boolean, they are optional here and `TableGX` warns in development when
 * `editable` is true but a required one (`onSaveEdit`, `editableColumnIds`) is
 * missing.
 */
export type TableGXTableProps<TRow extends TableRowData> = ReadOnlyTableProps<TRow> & {
  /** Toggle inline editing on/off live. Defaults to read-only (`false`). */
  editable?: boolean
} & Partial<EditableTableExtraProps<TRow>>

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

// --- IndependentTabbedTable (separate tables per tab) ---

/**
 * Shared config for one independent tab. Unlike `TabbedTableTab`, each tab owns
 * its **entire** dataset and identity — there is no shared row identity across
 * tabs, so the row shape may differ from tab to tab. Build these through the
 * typed `independentTable()` factory so each tab stays fully type-checked at the
 * point of definition even when row shapes differ across tabs.
 */
export type IndependentTabBase<TRow extends TableRowData> = {
  /** Stable tab key. */
  id: string
  /** Button text. */
  label: ReactNode
  /** This tab's own rows. */
  data: TRow[]
  /** This tab's own row identity. */
  getRowId: GetRowId<TRow>
  /** This tab's column set. */
  columns: ColumnDef<TRow, unknown>[]
  frozenColumns?: number
  initialSorting?: SortingState
  emptyMessage?: string
  isLoading?: boolean
  loadingSkeleton?: LoadingSkeleton
  measure?: MeasureTextFn
  /** Floor auto-width on the header label + icons (default true); false sizes from data only. */
  includeHeaderInAutosize?: boolean
  columnLabel?: (columnId: string) => string
  enableMultiSort?: boolean
  enableRowSelection?: boolean
  enableColumnVisibility?: boolean
  /** Full localStorage key for this tab's column visibility (not a base). */
  columnVisibilityStorageKey?: string
  /** Row virtualization for this tab (default true). See {@link AdvancedFeatureProps.enableRowVirtualization}. */
  enableRowVirtualization?: boolean
  /** Column virtualization for this tab (default true). See {@link AdvancedFeatureProps.enableColumnVirtualization}. */
  enableColumnVirtualization?: boolean
  /** Body row height for this tab (default fixed 56px). See {@link AdvancedFeatureProps.rowHeight}. */
  rowHeight?: RowHeight<TRow>
  enableFooter?: boolean
  /** Show a built-in global search bar for this tab (see {@link AdvancedFeatureProps.enableGlobalSearch}). */
  enableGlobalSearch?: boolean
  /** Restrict this tab's global search to these column ids (see {@link AdvancedFeatureProps.searchableColumns}). */
  searchableColumns?: string[]
  /** Placeholder for this tab's global-search input. Defaults to "Search…". */
  searchPlaceholder?: string
  /** Show an opt-in row count for this tab (see {@link AdvancedFeatureProps.enableRecordCount}). */
  enableRecordCount?: boolean
  /** Where this tab's record count renders: `'top'` or `'bottom'`. Default `'top'`. */
  recordCountPosition?: RecordCountPosition
  /** Override this tab's record-count text/markup. */
  recordCountLabel?: RecordCountLabel
  enableExpanding?: boolean
  getSubRows?: (row: TRow) => TRow[] | undefined
  defaultExpanded?: boolean | Record<string, boolean>
}

export type ReadOnlyIndependentTab<TRow extends TableRowData> = IndependentTabBase<TRow> & {
  editable?: false
}

export type EditableIndependentTab<TRow extends TableRowData> = IndependentTabBase<TRow> & {
  editable: true
  editableColumnIds: string[]
  onSaveEdit: SaveEditFn<TRow>
  columnGroups?: ColumnGroupDef[]
  singleClickEdit?: boolean
  getCellClassName?: (row: TRow, columnId: string) => string | undefined
  isSubmitting?: boolean
}

/** A single independent tab's typed config (read-only or editable). */
export type IndependentTabConfig<TRow extends TableRowData> =
  | ReadOnlyIndependentTab<TRow>
  | EditableIndependentTab<TRow>

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
  /**
   * Custom skeleton rendered while `isLoading` is true, replacing the built-in
   * `TableSkeleton`. Accepts static markup, or a render function receiving the
   * computed visible column widths. When omitted, the default skeleton is used.
   */
  loadingSkeleton?: LoadingSkeleton
  /** Each tab persists column visibility under `${base}:${tab.id}`. */
  columnVisibilityStorageKeyBase?: string
  /** Distinct per mounted TabbedTable so sliding indicators don't cross instances. */
  tabIndicatorLayoutId?: string
  /**
   * Show a toolbar button that opens a popover for managing the shared
   * multi-column sort hierarchy (flip direction, remove, reorder priority),
   * including sorts on columns not shown on the active tab. Default off.
   */
  enableSortHierarchy?: boolean
  measure?: MeasureTextFn
  /**
   * Forwarded to every tab's table. When true (default) the header label and
   * its icons floor each column's auto-sized width; false sizes purely from
   * data-cell content. Build-time prop, not a user-facing toggle.
   */
  includeHeaderInAutosize?: boolean
  classNames?: TabbedTableClassNames
  /** Show a hover popover on each tab listing that tab's columns. Default false. */
  enableTabColumnPreview?: boolean
  /** Hover delay (ms) before the column-preview popover opens. Default 600. */
  tabColumnPreviewDelayMs?: number
  /** Where the column-preview popover opens relative to the tab strip. Default 'auto'. */
  tabColumnPreviewPosition?: TabColumnPreviewPosition
} & Pick<
  AdvancedFeatureProps<TRow>,
  | 'enableMultiSort'
  | 'enableRowSelection'
  | 'selectedRowIds'
  | 'onSelectedRowIdsChange'
  | 'enableColumnVisibility'
  | 'enableRowVirtualization'
  | 'enableColumnVirtualization'
  | 'rowHeight'
  | 'enableFooter'
  | 'enableGlobalSearch'
  | 'globalSearch'
  | 'onGlobalSearchChange'
  | 'searchableColumns'
  | 'searchPlaceholder'
  | 'enableRecordCount'
  | 'recordCountPosition'
  | 'recordCountLabel'
  | 'enableColumnJump'
  | 'columnJumpIncludeHidden'
  | 'columnJumpGlobalShortcut'
> &
  Pick<AdvancedFeatureProps<TRow>, 'enableExpanding' | 'getSubRows' | 'defaultExpanded'>
