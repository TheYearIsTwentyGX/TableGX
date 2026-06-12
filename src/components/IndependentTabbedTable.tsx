import type {
  ColumnDef,
  ColumnFiltersState,
  OnChangeFn,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table'
import { useCallback, useId, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ColumnVisibilityPicker, type ColumnVisibilityItem } from '../core/ColumnVisibilityPicker'
import { describeFilterValue, FilterBadges, type FilterBadgeItem } from '../core/FilterBadges'
import { TableCore } from '../core/TableCore'
import { TabStripShell } from '../core/TabStripShell'
import { getColumnId } from '../hooks/useAutoColumnWidths'
import { cn } from '../lib/cn'
import { isEmptyFilterValue } from '../lib/filtering'
import type {
  ColumnFilterValue,
  IndependentTabConfig,
  MeasureTextFn,
  TabbedTableClassNames,
  TableRowData,
} from '../types'

/**
 * Generic-erased state + handlers the host lifts for each tab (kept outside the
 * per-tab generic so a heterogeneous `IndependentTab[]` can be stored together).
 */
type IndependentTabRenderArgs = {
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  columnFilters: ColumnFiltersState
  onColumnFiltersChange: Dispatch<SetStateAction<ColumnFiltersState>>
  visibility: VisibilityState
  onVisibilityChange: OnChangeFn<VisibilityState>
  selectedRowIds: string[] | undefined
  onSelectedRowIdsChange: (ids: string[]) => void
  measure?: MeasureTextFn
  classNames?: TabbedTableClassNames
}

/**
 * A type-erased independent tab descriptor produced by {@link independentTable}.
 * The concrete row type is captured inside the closures, so tabs with different
 * row shapes can be held together in a single `IndependentTab[]`.
 */
export type IndependentTab = {
  id: string
  label: ReactNode
  initialSorting?: SortingState
  enableColumnVisibility: boolean
  enableRowSelection: boolean
  /** Full localStorage key for this tab's column visibility, if any. */
  columnVisibilityStorageKey?: string
  /** Column-picker rows for the current visibility (empty when not applicable). */
  getPickerItems: (visibility: VisibilityState) => ColumnVisibilityItem[]
  /** Active-filter badge descriptors for the current filters. */
  getFilterBadges: (
    filters: ColumnFiltersState,
    clearColumn: (columnId: string) => void,
  ) => FilterBadgeItem[]
  /** Render this tab's table panel. */
  render: (args: IndependentTabRenderArgs) => ReactNode
}

function columnLabelOf<TRow extends TableRowData>(
  config: IndependentTabConfig<TRow>,
  columnId: string,
): string {
  if (config.columnLabel) return config.columnLabel(columnId)
  const col = config.columns.find(
    (c) => getColumnId(c as ColumnDef<TRow, unknown>) === columnId,
  )
  return col && typeof col.header === 'string' ? col.header : columnId
}

/**
 * Build a fully type-checked, type-erased independent tab. Each call captures
 * its own row type `TRow`, so a `IndependentTab[]` may mix tabs with completely
 * different row shapes while each config stays type-safe at its definition site.
 */
export function independentTable<TRow extends TableRowData>(
  config: IndependentTabConfig<TRow>,
): IndependentTab {
  const enableColumnVisibility = config.enableColumnVisibility === true
  const enableRowSelection = config.enableRowSelection === true
  const usesColumnGroups = config.editable === true && Boolean(config.columnGroups)

  return {
    id: config.id,
    label: config.label,
    initialSorting: config.initialSorting,
    enableColumnVisibility,
    enableRowSelection,
    columnVisibilityStorageKey: config.columnVisibilityStorageKey,

    getPickerItems: (visibility) => {
      // The picker is unavailable with grouped editable headers (matches TabbedTable).
      if (!enableColumnVisibility || usesColumnGroups) return []
      return config.columns
        .map((c) => c as ColumnDef<TRow, unknown>)
        .filter((c) => c.enableHiding !== false)
        .map((c) => {
          const id = getColumnId(c)
          return {
            id,
            label: columnLabelOf(config, id),
            visible: visibility[id] !== false,
          }
        })
    },

    getFilterBadges: (filters, clearColumn) =>
      filters
        .filter((f) => !isEmptyFilterValue(f.value as ColumnFilterValue))
        .map((f) => ({
          key: f.id,
          label: `${columnLabelOf(config, f.id)}: ${describeFilterValue(
            f.value as ColumnFilterValue,
          )}`,
          onClear: () => clearColumn(f.id),
        })),

    render: (args) => (
      <TableCore<TRow>
        data={config.data}
        columns={config.columns}
        getRowId={config.getRowId}
        editable={config.editable === true}
        editableColumnIds={config.editable === true ? config.editableColumnIds : undefined}
        onSaveEdit={config.editable === true ? config.onSaveEdit : undefined}
        singleClickEdit={config.editable === true ? config.singleClickEdit : undefined}
        columnGroups={config.editable === true ? config.columnGroups : undefined}
        getCellClassName={config.editable === true ? config.getCellClassName : undefined}
        isSubmitting={config.editable === true ? config.isSubmitting : undefined}
        bordered={false}
        frozenColumns={config.frozenColumns ?? 0}
        controlledSorting={args.sorting}
        onControlledSortingChange={args.onSortingChange}
        columnLabel={config.columnLabel ?? ((id) => columnLabelOf(config, id))}
        columnFilters={args.columnFilters}
        onColumnFiltersChange={args.onColumnFiltersChange}
        controlledVisibility={args.visibility}
        onControlledVisibilityChange={args.onVisibilityChange}
        hideBuiltInPicker
        hideFilterBadges
        enableMultiSort={config.enableMultiSort}
        enableRowSelection={enableRowSelection}
        selectedRowIds={args.selectedRowIds}
        onSelectedRowIdsChange={args.onSelectedRowIdsChange}
        enableColumnVisibility={false}
        enableFooter={config.enableFooter}
        enableExpanding={config.enableExpanding}
        getSubRows={config.getSubRows}
        defaultExpanded={config.defaultExpanded}
        emptyMessage={config.emptyMessage}
        isLoading={config.isLoading}
        loadingSkeleton={config.loadingSkeleton}
        measure={config.measure ?? args.measure}
        classNames={args.classNames}
      />
    ),
  }
}

export type IndependentTabbedTableProps = {
  /** Built via the {@link independentTable} factory; each tab is its own table. */
  tabs: IndependentTab[]
  /** Controlled active tab. */
  activeTabId?: string
  /** Initial active tab when uncontrolled. */
  defaultTabId?: string
  onActiveTabChange?: (id: string) => void
  /** Right-aligned tab-strip controls (refresh/export, etc.). */
  actions?: ReactNode
  /** Distinct per mounted instance so sliding indicators don't cross instances. */
  tabIndicatorLayoutId?: string
  /** Default text measurer; a tab's own `measure` takes precedence. */
  measure?: MeasureTextFn
  classNames?: TabbedTableClassNames
}

function readStoredVisibility(tabs: IndependentTab[]): Record<string, VisibilityState> {
  const out: Record<string, VisibilityState> = {}
  if (typeof window === 'undefined') return out
  for (const tab of tabs) {
    const key = tab.columnVisibilityStorageKey
    if (!key) continue
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) out[tab.id] = JSON.parse(raw) as VisibilityState
    } catch {
      // best-effort restore
    }
  }
  return out
}

/**
 * A tabbed container where each tab is a **completely independent table** — its
 * own data, row shape, identity, sorting, filtering, selection, and column
 * visibility. Tabs share only the folder-tab strip and slide animation; nothing
 * crosses between them. For multiple views over one shared dataset (shared
 * selection + cross-tab filter intersection), use `TabbedTable` instead.
 */
export function IndependentTabbedTable({
  tabs,
  activeTabId: controlledActiveId,
  defaultTabId,
  onActiveTabChange,
  actions,
  tabIndicatorLayoutId,
  measure,
  classNames,
}: IndependentTabbedTableProps) {
  const autoLayoutId = useId()
  const indicatorLayoutId = tabIndicatorLayoutId ?? `tgx-indep-tab-indicator-${autoLayoutId}`

  // ----- Active tab (slide/animation lives in the shared shell) -----
  const [internalActiveId, setInternalActiveId] = useState(defaultTabId ?? tabs[0]?.id ?? '')
  const activeId = controlledActiveId ?? internalActiveId
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0]

  const selectTab = useCallback(
    (id: string) => {
      if (id === activeId) return
      if (controlledActiveId === undefined) setInternalActiveId(id)
      onActiveTabChange?.(id)
    },
    [activeId, controlledActiveId, onActiveTabChange],
  )

  // ----- Per-tab state, lifted by id so it survives tab switches -----
  const [sortingByTab, setSortingByTab] = useState<Record<string, SortingState>>({})
  const [filtersByTab, setFiltersByTab] = useState<Record<string, ColumnFiltersState>>({})
  const [selectionByTab, setSelectionByTab] = useState<Record<string, string[]>>({})
  const [visibilityByTab, setVisibilityByTab] = useState<Record<string, VisibilityState>>(() =>
    readStoredVisibility(tabs),
  )

  const sortingHandlerFor = useCallback(
    (tabId: string): OnChangeFn<SortingState> =>
      (updater) =>
        setSortingByTab((prev) => {
          const current = prev[tabId] ?? []
          return { ...prev, [tabId]: typeof updater === 'function' ? updater(current) : updater }
        }),
    [],
  )

  const filtersHandlerFor = useCallback(
    (tabId: string): Dispatch<SetStateAction<ColumnFiltersState>> =>
      (updater) =>
        setFiltersByTab((prev) => {
          const current = prev[tabId] ?? []
          return { ...prev, [tabId]: typeof updater === 'function' ? updater(current) : updater }
        }),
    [],
  )

  const selectionHandlerFor = useCallback(
    (tabId: string) => (ids: string[]) =>
      setSelectionByTab((prev) => ({ ...prev, [tabId]: ids })),
    [],
  )

  const visibilityHandlerFor = useCallback(
    (tab: IndependentTab): OnChangeFn<VisibilityState> =>
      (updater) =>
        setVisibilityByTab((prev) => {
          const current = prev[tab.id] ?? {}
          const next = typeof updater === 'function' ? updater(current) : updater
          const key = tab.columnVisibilityStorageKey
          if (key && typeof window !== 'undefined') {
            try {
              window.localStorage.setItem(key, JSON.stringify(next))
            } catch {
              // best-effort persist
            }
          }
          return { ...prev, [tab.id]: next }
        }),
    [],
  )

  const clearColumnFilter = useCallback(
    (tabId: string) => (columnId: string) =>
      setFiltersByTab((prev) => ({
        ...prev,
        [tabId]: (prev[tabId] ?? []).filter((f) => f.id !== columnId),
      })),
    [],
  )

  const clearAllFilters = useCallback(
    (tabId: string) => () => setFiltersByTab((prev) => ({ ...prev, [tabId]: [] })),
    [],
  )

  // ----- Active tab chrome (reflects only the active tab) -----
  const activeFilters = activeTab ? (filtersByTab[activeTab.id] ?? []) : []
  const activeVisibility = activeTab ? (visibilityByTab[activeTab.id] ?? {}) : {}

  const badgeItems = activeTab
    ? activeTab.getFilterBadges(activeFilters, clearColumnFilter(activeTab.id))
    : []
  const pickerItems = activeTab ? activeTab.getPickerItems(activeVisibility) : []
  const hasActions = Boolean(actions) || pickerItems.length > 0

  return (
    <TabStripShell
      tabs={tabs.map((t) => ({ id: t.id, label: t.label }))}
      activeId={activeId}
      onSelectTab={selectTab}
      indicatorLayoutId={indicatorLayoutId}
      classNames={classNames}
      centerContent={
        <FilterBadges
          items={badgeItems}
          onClearAll={activeTab ? clearAllFilters(activeTab.id) : () => {}}
          className={cn('flex-nowrap border-b-0 p-0', classNames?.filterBadges)}
        />
      }
      endContent={
        hasActions ? (
          <>
            {actions}
            {pickerItems.length > 0 && activeTab && (
              <ColumnVisibilityPicker
                items={pickerItems}
                onToggle={(id, visible) => {
                  visibilityHandlerFor(activeTab)((prev) => ({ ...prev, [id]: visible }))
                }}
              />
            )}
          </>
        ) : undefined
      }
      renderPanel={() =>
        activeTab
          ? activeTab.render({
              sorting: sortingByTab[activeTab.id] ?? activeTab.initialSorting ?? [],
              onSortingChange: sortingHandlerFor(activeTab.id),
              columnFilters: filtersByTab[activeTab.id] ?? [],
              onColumnFiltersChange: filtersHandlerFor(activeTab.id),
              visibility: visibilityByTab[activeTab.id] ?? {},
              onVisibilityChange: visibilityHandlerFor(activeTab),
              selectedRowIds: activeTab.enableRowSelection
                ? (selectionByTab[activeTab.id] ?? [])
                : undefined,
              onSelectedRowIdsChange: selectionHandlerFor(activeTab.id),
              measure,
              classNames,
            })
          : null
      }
    />
  )
}
