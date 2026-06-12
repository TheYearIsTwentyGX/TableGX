import type { ColumnDef, OnChangeFn, SortingState, VisibilityState } from '@tanstack/react-table'
import { useCallback, useId, useMemo, useState } from 'react'
import { ColumnVisibilityPicker } from '../core/ColumnVisibilityPicker'
import { describeFilterValue, FilterBadges, type FilterBadgeItem } from '../core/FilterBadges'
import { TableCore } from '../core/TableCore'
import { TabStripShell } from '../core/TabStripShell'
import { getColumnId } from '../hooks/useAutoColumnWidths'
import { useSharedTabFilters } from '../hooks/useSharedTabFilters'
import { cn } from '../lib/cn'
import type { TabbedTableProps, TabbedTableTab, TableRowData } from '../types'

/**
 * Multiple table views (tabs) over the same rows, with cross-tab filter
 * intersection, shared selection, and a folder-tab strip (spec §18).
 */
export function TabbedTable<TRow extends TableRowData>(props: TabbedTableProps<TRow>) {
  const {
    data,
    getRowId,
    tabs,
    activeTabId: controlledActiveId,
    defaultTabId,
    onActiveTabChange,
    actions,
    emptyMessage,
    isLoading,
    loadingSkeleton,
    columnVisibilityStorageKeyBase,
    tabIndicatorLayoutId,
    measure,
    classNames,
    enableMultiSort,
    enableRowSelection,
    selectedRowIds,
    onSelectedRowIdsChange,
    enableColumnVisibility,
    enableFooter,
    enableExpanding,
    getSubRows,
    defaultExpanded,
  } = props

  const autoLayoutId = useId()
  const indicatorLayoutId = tabIndicatorLayoutId ?? `tgx-tab-indicator-${autoLayoutId}`

  // ----- Active tab (slide/animation lives in the shared shell) -----

  const [internalActiveId, setInternalActiveId] = useState(defaultTabId ?? tabs[0]?.id ?? '')
  const activeId = controlledActiveId ?? internalActiveId
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeId),
  )
  const activeTab = tabs[activeIndex]

  const selectTab = (id: string) => {
    if (id === activeId) return
    if (controlledActiveId === undefined) setInternalActiveId(id)
    onActiveTabChange?.(id)
  }

  // ----- Shared selection across tabs (spec §11/§18) -----

  const [internalSelected, setInternalSelected] = useState<string[]>([])
  const effectiveSelected = enableRowSelection
    ? (selectedRowIds ?? internalSelected)
    : undefined
  const handleSelectedChange = useCallback(
    (ids: string[]) => {
      setInternalSelected(ids)
      onSelectedRowIdsChange?.(ids)
    },
    [onSelectedRowIdsChange],
  )

  // ----- Cross-tab shared filtering (spec §18.3) -----

  const { filtersByTab, setFiltersForTab, dataForTab, activeFilters, clearFilter, clearAll } =
    useSharedTabFilters({ data, getRowId, tabs, getSubRows })

  const columnLabelFor = useCallback(
    (tab: TabbedTableTab<TRow>, columnId: string): string => {
      if (tab.columnLabel) return tab.columnLabel(columnId)
      const col = tab.columns.find((c) => getColumnId(c as ColumnDef<TRow, unknown>) === columnId)
      return col && typeof col.header === 'string' ? col.header : columnId
    },
    [],
  )

  const badgeItems: FilterBadgeItem[] = activeFilters.map((f) => {
    const tab = tabs.find((t) => t.id === f.tabId)
    const colLabel = tab ? columnLabelFor(tab, f.columnId) : f.columnId
    return {
      key: `${f.tabId}:${f.columnId}`,
      label: `${tab?.label ?? f.tabId} • ${colLabel}: ${describeFilterValue(f.value)}`,
      onClear: () => clearFilter(f.tabId, f.columnId),
    }
  })

  // ----- Shared sorting across tabs (spec §18) -----
  //
  // One SortingState for the whole tab group, like selection: a sort applied on
  // any tab reorders rows on EVERY tab, since all tabs are views over the same
  // dataset. Sorting is fully shared regardless of which columns each tab shows
  // — when the sort targets a column the active tab doesn't render, that
  // column's def is handed to the tab's TableCore as a hidden sort-only column
  // (see sortOnlyColumns below) so its rows are still ordered. Seeded from the
  // initially-active tab's initialSorting (falling back to the first tab that
  // defines one).

  const [sharedSorting, setSharedSorting] = useState<SortingState>(() => {
    const initiallyActive = tabs.find(
      (t) => t.id === (controlledActiveId ?? defaultTabId ?? tabs[0]?.id),
    )
    return (
      initiallyActive?.initialSorting ??
      tabs.find((t) => t.initialSorting)?.initialSorting ??
      []
    )
  })

  const handleSortingChange = useCallback<OnChangeFn<SortingState>>((updater) => {
    setSharedSorting((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  }, [])

  // Leaf column defs referenced by the shared sort that the active tab doesn't
  // render, drawn from the union of all tabs' leaf columns (first definition
  // wins for a shared id, since they read the same underlying field). Handed to
  // the active tab's TableCore as hidden sort-only columns so its rows are
  // ordered by the foreign column without a visible header or warning.
  const sortOnlyColumns = useMemo<ColumnDef<TRow, unknown>[]>(() => {
    if (!activeTab) return []
    const ownIds = new Set(
      activeTab.columns.map((c) => getColumnId(c as ColumnDef<TRow, unknown>)),
    )
    const foreignIds = sharedSorting.map((s) => s.id).filter((id) => !ownIds.has(id))
    if (foreignIds.length === 0) return []
    const union = new Map<string, ColumnDef<TRow, unknown>>()
    for (const tab of tabs) {
      for (const c of tab.columns) {
        const col = c as ColumnDef<TRow, unknown>
        const id = getColumnId(col)
        if (id && !union.has(id)) union.set(id, col)
      }
    }
    const out: ColumnDef<TRow, unknown>[] = []
    for (const id of foreignIds) {
      const def = union.get(id)
      if (def) out.push(def)
    }
    return out
  }, [activeTab, sharedSorting, tabs])

  // ----- Per-tab column visibility, persisted under `${base}:${tab.id}` -----

  const storageKeyFor = useCallback(
    (tab: TabbedTableTab<TRow>): string | undefined =>
      tab.columnVisibilityStorageKey ??
      (columnVisibilityStorageKeyBase
        ? `${columnVisibilityStorageKeyBase}:${tab.id}`
        : undefined),
    [columnVisibilityStorageKeyBase],
  )

  const [visibilityByTab, setVisibilityByTab] = useState<Record<string, VisibilityState>>(() => {
    const out: Record<string, VisibilityState> = {}
    if (typeof window === 'undefined') return out
    for (const tab of tabs) {
      const key = storageKeyFor(tab)
      if (!key) continue
      try {
        const raw = window.localStorage.getItem(key)
        if (raw) out[tab.id] = JSON.parse(raw) as VisibilityState
      } catch {
        // best-effort restore
      }
    }
    return out
  })

  const makeVisibilityHandler = useCallback(
    (tab: TabbedTableTab<TRow>): OnChangeFn<VisibilityState> =>
      (updater) => {
        setVisibilityByTab((prev) => {
          const current = prev[tab.id] ?? {}
          const next = typeof updater === 'function' ? updater(current) : updater
          const key = storageKeyFor(tab)
          if (key && typeof window !== 'undefined') {
            try {
              window.localStorage.setItem(key, JSON.stringify(next))
            } catch {
              // best-effort persist
            }
          }
          return { ...prev, [tab.id]: next }
        })
      },
    [storageKeyFor],
  )

  // ----- Column picker for the active tab (excluded entirely with column groups) -----

  const pickerItems =
    enableColumnVisibility && activeTab && !(activeTab.editable && activeTab.columnGroups)
      ? activeTab.columns
          .map((c) => c as ColumnDef<TRow, unknown>)
          .filter((c) => c.enableHiding !== false)
          .map((c) => {
            const id = getColumnId(c)
            return {
              id,
              label: columnLabelFor(activeTab, id),
              visible: (visibilityByTab[activeTab.id] ?? {})[id] !== false,
            }
          })
      : []

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
          onClearAll={clearAll}
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
                  makeVisibilityHandler(activeTab)((prev) => ({ ...prev, [id]: visible }))
                }}
              />
            )}
          </>
        ) : undefined
      }
      renderPanel={(pinnedPaneX) =>
        activeTab ? (
          <TableCore<TRow>
            data={dataForTab(activeTab.id)}
            columns={activeTab.columns}
            getRowId={getRowId}
            editable={activeTab.editable === true}
            editableColumnIds={
              activeTab.editable === true ? activeTab.editableColumnIds : undefined
            }
            onSaveEdit={activeTab.editable === true ? activeTab.onSaveEdit : undefined}
            singleClickEdit={activeTab.editable === true ? activeTab.singleClickEdit : undefined}
            columnGroups={activeTab.editable === true ? activeTab.columnGroups : undefined}
            getCellClassName={
              activeTab.editable === true ? activeTab.getCellClassName : undefined
            }
            isSubmitting={activeTab.editable === true ? activeTab.isSubmitting : undefined}
            bordered={false}
            frozenColumns={activeTab.frozenColumns ?? 0}
            controlledSorting={sharedSorting}
            onControlledSortingChange={handleSortingChange}
            sortOnlyColumns={sortOnlyColumns}
            columnLabel={activeTab.columnLabel ?? ((id) => columnLabelFor(activeTab, id))}
            columnFilters={filtersByTab[activeTab.id] ?? []}
            onColumnFiltersChange={setFiltersForTab(activeTab.id)}
            controlledVisibility={visibilityByTab[activeTab.id] ?? {}}
            onControlledVisibilityChange={makeVisibilityHandler(activeTab)}
            hideBuiltInPicker
            hideFilterBadges
            enableMultiSort={enableMultiSort}
            enableRowSelection={enableRowSelection}
            selectedRowIds={effectiveSelected}
            onSelectedRowIdsChange={handleSelectedChange}
            enableColumnVisibility={false}
            enableFooter={enableFooter}
            enableExpanding={enableExpanding}
            getSubRows={getSubRows}
            defaultExpanded={defaultExpanded}
            emptyMessage={emptyMessage}
            isLoading={isLoading}
            loadingSkeleton={loadingSkeleton}
            measure={measure}
            classNames={classNames}
            pinnedPaneX={pinnedPaneX}
          />
        ) : null
      }
    />
  )
}
