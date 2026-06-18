import type {
  ColumnFiltersState,
  OnChangeFn,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table'
import type { MotionValue } from 'framer-motion'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { ColumnVisibilityItem } from '../core/ColumnVisibilityPicker'
import type { FilterBadgeItem } from '../core/FilterBadges'
import type {
  MeasureTextFn,
  RecordCountInfo,
  RecordCountLabel,
  TabbedTableClassNames,
} from '../types'

/**
 * Selects how the shared store combines cross-cutting state:
 * - `shared` — one dataset, many views: sorting + selection are shared across
 *   tabs and filters intersect (the `TabbedTable` semantics).
 * - `independent` — every tab is its own table: sorting, selection, and filters
 *   are isolated per tab (the `IndependentTabbedTable` semantics).
 */
export type TableMode = 'shared' | 'independent'

/**
 * Generic-erased state + handlers the store computes for the active tab and
 * hands to a tab model's `render`. Mirrors the props a tab's `TableCore` needs,
 * kept type-erased so a heterogeneous tab set can share one store.
 */
export type TableBodyRenderArgs = {
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  columnFilters: ColumnFiltersState
  onColumnFiltersChange: Dispatch<SetStateAction<ColumnFiltersState>>
  visibility: VisibilityState
  onVisibilityChange: OnChangeFn<VisibilityState>
  /** Active tab's global-search query (applies to the active tab's rows). */
  globalSearch: string
  onGlobalSearchChange: (value: string) => void
  selectedRowIds: string[] | undefined
  onSelectedRowIdsChange: (ids: string[]) => void
  /** Shared-dataset rows after cross-tab filter intersection (shared mode only). */
  sharedData?: unknown[]
  /** Every tab's current filters, so shared-mode adapters can resolve sort-only columns. */
  allFilters: Record<string, ColumnFiltersState>
  measure?: MeasureTextFn
  classNames?: TabbedTableClassNames
  /** When false, the panel suppresses its own top count so the strip shows it. */
  recordCountInToolbar?: boolean
  /** Lifts the panel's computed leaf counts up to the tab strip. */
  onRecordCountChange?: (info: RecordCountInfo | null) => void
  /** Negated tab-slide x, supplied by the sliding panel host (kept static pane). */
  pinnedPaneX?: MotionValue<number>
}

/**
 * A type-erased descriptor for one tab in the store. Both `TabbedTable`
 * (shared) and `IndependentTabbedTable` (independent) produce these; the
 * concrete row type lives inside the closures so tabs may differ in shape.
 */
export type TableTabModel = {
  id: string
  label: ReactNode
  /** Full localStorage key for this tab's column visibility, if any. */
  columnVisibilityStorageKey?: string
  initialSorting?: SortingState
  enableRowSelection: boolean
  /** True when this tab opts into the built-in global search bar. */
  enableGlobalSearch: boolean
  /** Placeholder for this tab's global-search input. */
  searchPlaceholder?: string
  /** True when this tab's record count is enabled and placed at the top (tab strip). */
  showsTopRecordCount: boolean
  recordCountLabel?: RecordCountLabel
  /** Column-picker rows for the current visibility (empty when not applicable). */
  getPickerItems: (visibility: VisibilityState) => ColumnVisibilityItem[]
  /** Render this tab's table panel from the store-computed args. */
  render: (args: TableBodyRenderArgs) => ReactNode
}

/** Read-only handle on filter state, passed to the badge-building adapter. */
export type FilterChromeApi = {
  activeId: string
  filtersByTab: Record<string, ColumnFiltersState>
  /** All non-empty filters across every tab (shared-mode badge source). */
  activeFilters: { tabId: string; columnId: string; value: unknown }[]
  clearFilter: (tabId: string, columnId: string) => void
}

/** The shared-dataset inputs the store needs to intersect cross-tab filters. */
export type SharedFilterSource = {
  data: unknown[]
  getRowId: (row: unknown) => unknown
  getSubRows?: (row: unknown) => unknown[] | undefined
  /** Shared tabs (with columns) used to build per-tab filter accessors. */
  tabs: unknown[]
}

/** Configuration handed to {@link TableProvider}. */
export type TableProviderConfig = {
  mode: TableMode
  tabs: TableTabModel[]
  activeTabId?: string
  defaultTabId?: string
  onActiveTabChange?: (id: string) => void
  /** Distinct per mounted instance so sliding indicators don't cross instances. */
  indicatorLayoutId?: string
  classNames?: TabbedTableClassNames
  measure?: MeasureTextFn
  // ----- shared-mode selection (group-level) -----
  enableRowSelection?: boolean
  selectedRowIds?: string[]
  onSelectedRowIdsChange?: (ids: string[]) => void
  // ----- shared-mode filter intersection -----
  sharedFilterSource?: SharedFilterSource
  // ----- chrome derivations (data-dependent, supplied by adapters) -----
  buildFilterBadges?: (api: FilterChromeApi) => FilterBadgeItem[]
  enableSortHierarchy?: boolean
  resolveSortLabel?: (columnId: string) => string
}

/** The headless store exposed through context to every primitive. */
export type TableStore = {
  mode: TableMode
  tabs: TableTabModel[]
  /** Resolved active id (falls back to the first tab when stale/missing). */
  activeId: string
  activeTab: TableTabModel | undefined
  selectTab: (id: string) => void
  indicatorLayoutId: string
  classNames?: TabbedTableClassNames
  /** Body args for the active tab; the panel host injects `pinnedPaneX`. */
  getBodyArgs: (pinnedPaneX?: MotionValue<number>) => TableBodyRenderArgs
  // ----- chrome (computed each render) -----
  filterBadges: FilterBadgeItem[]
  clearAllFilters: () => void
  pickerItems: ColumnVisibilityItem[]
  togglePickerItem: (id: string, visible: boolean) => void
  /** Set every column currently in the picker to a single visibility. */
  setAllPickerItems: (visible: boolean) => void
  sortControl: {
    sorting: SortingState
    resolveLabel: (columnId: string) => string
    onChange: (next: SortingState) => void
  } | null
  /** Global-search control for the active tab; null when that tab disables it. */
  search: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
  } | null
  recordCount: { info: RecordCountInfo | null; label?: RecordCountLabel } | null
}
