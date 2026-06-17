import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { describeFilterValue, type FilterBadgeItem } from '../core/FilterBadges'
import { TableCore } from '../core/TableCore'
import { getColumnId } from '../hooks/useAutoColumnWidths'
import {
  Table,
  type FilterChromeApi,
  type TableBodyRenderArgs,
  type TableTabModel,
} from '../primitives'
import type { ColumnFilterValue, TabbedTableProps, TabbedTableTab, TableRowData } from '../types'

/** Stable empty sort-only column list, so the no-foreign-sort case never remounts cells. */
const EMPTY_COLUMNS: ColumnDef<TableRowData, unknown>[] = []

/**
 * Multiple table views (tabs) over the same rows, with cross-tab filter
 * intersection, shared selection, and shared multi-column sorting (spec §18).
 * A thin composition over the shared headless store + compound primitives: the
 * store is the single source of truth for all cross-cutting state.
 */
export function TabbedTable<TRow extends TableRowData>(props: TabbedTableProps<TRow>) {
  const {
    data,
    getRowId,
    tabs,
    activeTabId,
    defaultTabId,
    onActiveTabChange,
    actions,
    emptyMessage,
    isLoading,
    loadingSkeleton,
    columnVisibilityStorageKeyBase,
    tabIndicatorLayoutId,
    measure,
    includeHeaderInAutosize,
    classNames,
    enableMultiSort,
    enableRowSelection,
    selectedRowIds,
    onSelectedRowIdsChange,
    enableColumnVisibility,
    enableRowVirtualization,
    enableColumnVirtualization,
    enableSortHierarchy,
    enableFooter,
    enableRecordCount,
    recordCountPosition,
    recordCountLabel,
    enableExpanding,
    getSubRows,
    defaultExpanded,
  } = props

  const columnLabelFor = useMemo(
    () =>
      (tab: TabbedTableTab<TRow>, columnId: string): string => {
        if (tab.columnLabel) return tab.columnLabel(columnId)
        const col = tab.columns.find((c) => getColumnId(c as ColumnDef<TRow, unknown>) === columnId)
        return col && typeof col.header === 'string' ? col.header : columnId
      },
    [],
  )

  // Resolve a readable label from the union of every tab's columns, so sorted
  // columns that aren't present on the active tab still show a name.
  const resolveColumnLabel = useMemo(
    () =>
      (columnId: string): string => {
        for (const tab of tabs) {
          const col = tab.columns.find(
            (c) => getColumnId(c as ColumnDef<TRow, unknown>) === columnId,
          )
          if (col) return columnLabelFor(tab, columnId)
        }
        return columnId
      },
    [tabs, columnLabelFor],
  )

  const storageKeyFor = useMemo(
    () =>
      (tab: TabbedTableTab<TRow>): string | undefined =>
        tab.columnVisibilityStorageKey ??
        (columnVisibilityStorageKeyBase
          ? `${columnVisibilityStorageKeyBase}:${tab.id}`
          : undefined),
    [columnVisibilityStorageKeyBase],
  )

  const showTopRecordCount =
    enableRecordCount === true && (recordCountPosition ?? 'top') === 'top'

  // ----- Build the type-erased tab models the store renders -----
  const models = useMemo<TableTabModel[]>(() => {
    return tabs.map((tab) => {
      // Leaf column defs referenced by the shared sort that this tab doesn't
      // render, drawn from the union of all tabs' leaf columns (first definition
      // wins for a shared id). Handed to TableCore as hidden sort-only columns.
      //
      // The result identity is cached by the foreign-id list: `render` runs on
      // every store change (selection, etc.), and a fresh array each time would
      // bust TableCore's column memo and remount every cell.
      let sortOnlyCache: { key: string; cols: ColumnDef<TRow, unknown>[] } = {
        key: '',
        cols: EMPTY_COLUMNS as ColumnDef<TRow, unknown>[],
      }
      const sortOnlyFor = (sorting: { id: string }[]): ColumnDef<TRow, unknown>[] => {
        const ownIds = new Set(tab.columns.map((c) => getColumnId(c as ColumnDef<TRow, unknown>)))
        const foreignIds = sorting.map((s) => s.id).filter((id) => !ownIds.has(id))
        const key = foreignIds.join('|')
        if (key === sortOnlyCache.key) return sortOnlyCache.cols
        if (foreignIds.length === 0) {
          sortOnlyCache = { key, cols: EMPTY_COLUMNS as ColumnDef<TRow, unknown>[] }
          return sortOnlyCache.cols
        }
        const union = new Map<string, ColumnDef<TRow, unknown>>()
        for (const t of tabs) {
          for (const c of t.columns) {
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
        sortOnlyCache = { key, cols: out }
        return out
      }

      const model: TableTabModel = {
        id: tab.id,
        label: tab.label,
        columnVisibilityStorageKey: storageKeyFor(tab),
        initialSorting: tab.initialSorting,
        enableRowSelection: enableRowSelection === true,
        showsTopRecordCount: showTopRecordCount,
        recordCountLabel,
        getPickerItems: (visibility) => {
          if (enableColumnVisibility !== true) return []
          if (tab.editable === true && tab.columnGroups) return []
          return tab.columns
            .map((c) => c as ColumnDef<TRow, unknown>)
            .filter((c) => c.enableHiding !== false)
            .map((c) => {
              const id = getColumnId(c)
              return { id, label: columnLabelFor(tab, id), visible: visibility[id] !== false }
            })
        },
        render: (args: TableBodyRenderArgs) => (
          <TableCore<TRow>
            data={(args.sharedData as TRow[] | undefined) ?? data}
            columns={tab.columns}
            getRowId={getRowId}
            editable={tab.editable === true}
            editableColumnIds={tab.editable === true ? tab.editableColumnIds : undefined}
            onSaveEdit={tab.editable === true ? tab.onSaveEdit : undefined}
            singleClickEdit={tab.editable === true ? tab.singleClickEdit : undefined}
            columnGroups={tab.editable === true ? tab.columnGroups : undefined}
            getCellClassName={tab.editable === true ? tab.getCellClassName : undefined}
            isSubmitting={tab.editable === true ? tab.isSubmitting : undefined}
            bordered={false}
            frozenColumns={tab.frozenColumns ?? 0}
            controlledSorting={args.sorting}
            onControlledSortingChange={args.onSortingChange}
            sortOnlyColumns={sortOnlyFor(args.sorting)}
            columnLabel={tab.columnLabel ?? ((id) => columnLabelFor(tab, id))}
            columnFilters={args.columnFilters}
            onColumnFiltersChange={args.onColumnFiltersChange}
            controlledVisibility={args.visibility}
            onControlledVisibilityChange={args.onVisibilityChange}
            hideBuiltInPicker
            hideFilterBadges
            enableMultiSort={enableMultiSort}
            enableRowSelection={enableRowSelection}
            selectedRowIds={args.selectedRowIds}
            onSelectedRowIdsChange={args.onSelectedRowIdsChange}
            enableColumnVisibility={false}
            enableRowVirtualization={enableRowVirtualization}
            enableColumnVirtualization={enableColumnVirtualization}
            enableFooter={enableFooter}
            enableRecordCount={enableRecordCount}
            recordCountPosition={recordCountPosition}
            recordCountLabel={recordCountLabel}
            recordCountInToolbar={args.recordCountInToolbar}
            onRecordCountChange={args.onRecordCountChange}
            enableExpanding={enableExpanding}
            getSubRows={getSubRows}
            defaultExpanded={defaultExpanded}
            emptyMessage={emptyMessage}
            isLoading={isLoading}
            loadingSkeleton={loadingSkeleton}
            measure={args.measure}
            includeHeaderInAutosize={includeHeaderInAutosize}
            classNames={args.classNames}
            pinnedPaneX={args.pinnedPaneX}
          />
        ),
      }
      return model
    })
  }, [
    tabs,
    data,
    getRowId,
    storageKeyFor,
    enableRowSelection,
    showTopRecordCount,
    recordCountLabel,
    enableColumnVisibility,
    columnLabelFor,
    enableMultiSort,
    enableFooter,
    enableRecordCount,
    recordCountPosition,
    enableExpanding,
    getSubRows,
    defaultExpanded,
    emptyMessage,
    isLoading,
    loadingSkeleton,
    includeHeaderInAutosize,
  ])

  const buildFilterBadges = useMemo(
    () =>
      (api: FilterChromeApi): FilterBadgeItem[] =>
        api.activeFilters.map((f) => {
          const tab = tabs.find((t) => t.id === f.tabId)
          const colLabel = tab ? columnLabelFor(tab, f.columnId) : f.columnId
          return {
            key: `${f.tabId}:${f.columnId}`,
            label: `${tab?.label ?? f.tabId} • ${colLabel}: ${describeFilterValue(
              f.value as ColumnFilterValue,
            )}`,
            onClear: () => api.clearFilter(f.tabId, f.columnId),
          }
        }),
    [tabs, columnLabelFor],
  )

  return (
    <Table.Provider
      mode="shared"
      tabs={models}
      activeTabId={activeTabId}
      defaultTabId={defaultTabId}
      onActiveTabChange={onActiveTabChange}
      indicatorLayoutId={tabIndicatorLayoutId}
      classNames={classNames}
      measure={measure}
      enableRowSelection={enableRowSelection}
      selectedRowIds={selectedRowIds}
      onSelectedRowIdsChange={onSelectedRowIdsChange}
      sharedFilterSource={{
        data: data as unknown[],
        getRowId: getRowId as (row: unknown) => unknown,
        getSubRows: getSubRows as ((row: unknown) => unknown[] | undefined) | undefined,
        tabs,
      }}
      buildFilterBadges={buildFilterBadges}
      enableSortHierarchy={enableSortHierarchy}
      resolveSortLabel={resolveColumnLabel}
    >
      <Table.Container>
        <Table.TabStrip
          centerContent={<Table.FilterBadges />}
          endContent={
            <>
              {actions}
              <Table.SortControl />
              <Table.ColumnVisibility />
              <Table.RecordCount />
            </>
          }
        />
        <Table.Panels />
      </Table.Container>
    </Table.Provider>
  )
}
