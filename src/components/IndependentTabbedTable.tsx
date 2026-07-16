import type { ColumnDef, VisibilityState } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { type ColumnVisibilityItem } from '../core/ColumnVisibilityPicker'
import { describeFilterValue, type FilterBadgeItem } from '../core/FilterBadges'
import { TableCore } from '../core/TableCore'
import { getColumnId } from '../hooks/useAutoColumnWidths'
import { isEmptyFilterValue } from '../lib/filtering'
import {
  Table,
  type FilterChromeApi,
  type TableBodyRenderArgs,
  type TableTabModel,
} from '../primitives'
import type {
  ColumnFilterValue,
  IndependentTabConfig,
  MeasureTextFn,
  TabbedTableClassNames,
  TabColumnPreviewPosition,
  TableRowData,
} from '../types'

/**
 * A type-erased independent tab descriptor produced by {@link independentTable}.
 * The concrete row type is captured inside the closures, so tabs with different
 * row shapes can be held together in a single `IndependentTab[]`. Compatible
 * with the headless store's {@link TableTabModel} (extends it with a per-tab
 * filter-badge builder, since independent tabs surface their own filters).
 */
export type IndependentTab = TableTabModel & {
  enableColumnVisibility: boolean
  /** Active-filter badge descriptors for the current filters. */
  getFilterBadges: (
    filters: { id: string; value: unknown }[],
    clearColumn: (columnId: string) => void,
  ) => FilterBadgeItem[]
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
  const showsTopRecordCount =
    config.enableRecordCount === true && (config.recordCountPosition ?? 'top') === 'top'

  return {
    id: config.id,
    label: config.label,
    editable: config.editable === true,
    initialSorting: config.initialSorting,
    enableColumnVisibility,
    enableRowSelection,
    enableGlobalSearch: config.enableGlobalSearch === true,
    searchPlaceholder: config.searchPlaceholder,
    columnVisibilityStorageKey: config.columnVisibilityStorageKey,
    showsTopRecordCount,
    recordCountLabel: config.recordCountLabel,

    getPickerItems: (visibility: VisibilityState): ColumnVisibilityItem[] => {
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

    columnPreviewLabels: config.columns
      .map((c) => c as ColumnDef<TRow, unknown>)
      .filter((c) => c.enableHiding !== false)
      .map((c) => columnLabelOf(config, getColumnId(c)))
      .sort((a, b) => a.localeCompare(b)),

    columnJumpItems: config.columns
      .map((c) => c as ColumnDef<TRow, unknown>)
      .filter((c) => c.enableHiding !== false)
      .map((c) => {
        const id = getColumnId(c)
        return { id, label: columnLabelOf(config, id) }
      }),

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

    render: (args: TableBodyRenderArgs) => (
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
        enableRowVirtualization={config.enableRowVirtualization}
        enableColumnVirtualization={config.enableColumnVirtualization}
        rowHeight={config.rowHeight}
        enableFooter={config.enableFooter}
        enableGlobalSearch={config.enableGlobalSearch}
        globalSearch={args.globalSearch}
        onGlobalSearchChange={args.onGlobalSearchChange}
        searchableColumns={config.searchableColumns}
        searchPlaceholder={config.searchPlaceholder}
        searchInToolbar={false}
        enableRecordCount={config.enableRecordCount}
        recordCountPosition={config.recordCountPosition}
        recordCountLabel={config.recordCountLabel}
        recordCountInToolbar={args.recordCountInToolbar}
        onRecordCountChange={args.onRecordCountChange}
        enableExpanding={config.enableExpanding}
        getSubRows={config.getSubRows}
        defaultExpanded={config.defaultExpanded}
        emptyMessage={config.emptyMessage}
        isLoading={config.isLoading}
        loadingSkeleton={config.loadingSkeleton}
        measure={config.measure ?? args.measure}
        includeHeaderInAutosize={config.includeHeaderInAutosize}
        classNames={args.classNames}
        enableColumnJump={args.columnJumpEnabled}
        columnJumpIncludeHidden={args.columnJumpIncludeHiddenResolved}
        columnJumpGlobalShortcut={args.columnJumpGlobalShortcutResolved}
        columnJumpForeignEntries={args.columnJumpForeignEntries}
        onJumpToForeignColumn={args.onJumpToForeignColumn}
        scrollToColumnId={args.scrollToColumnId}
        onScrollToColumnHandled={args.onScrollToColumnHandled}
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
  /** Show a hover popover on each tab listing that tab's columns. Default false. */
  enableTabColumnPreview?: boolean
  /** Hover delay (ms) before the column-preview popover opens. Default 600. */
  tabColumnPreviewDelayMs?: number
  /** Where the column-preview popover opens relative to the tab strip. Default 'auto'. */
  tabColumnPreviewPosition?: TabColumnPreviewPosition
  /** Ctrl+G "jump to column" dialog, spanning all tabs. Default false. */
  enableColumnJump?: boolean
  /** Whether hidden columns appear in the jump list. Default true. */
  columnJumpIncludeHidden?: boolean
  /** Opt out of hover/focus scoping for the column-jump shortcut. Default false. */
  columnJumpGlobalShortcut?: boolean
}

/**
 * A tabbed container where each tab is a **completely independent table** — its
 * own data, row shape, identity, sorting, filtering, selection, and column
 * visibility. Tabs share only the folder-tab strip and slide animation; nothing
 * crosses between them. For multiple views over one shared dataset (shared
 * selection + cross-tab filter intersection), use `TabbedTable` instead.
 *
 * A thin composition over the shared headless store (in `independent` mode) +
 * compound primitives.
 */
export function IndependentTabbedTable({
  tabs,
  activeTabId,
  defaultTabId,
  onActiveTabChange,
  actions,
  tabIndicatorLayoutId,
  measure,
  classNames,
  enableTabColumnPreview,
  tabColumnPreviewDelayMs = 600,
  tabColumnPreviewPosition = 'auto',
  enableColumnJump,
  columnJumpIncludeHidden,
  columnJumpGlobalShortcut,
}: IndependentTabbedTableProps) {
  const buildFilterBadges = (api: FilterChromeApi): FilterBadgeItem[] => {
    const tab = tabs.find((t) => t.id === api.activeId)
    if (!tab) return []
    const filters = api.filtersByTab[api.activeId] ?? []
    return tab.getFilterBadges(filters, (columnId) => api.clearFilter(api.activeId, columnId))
  }

  const tabsForStore = tabs.map((t) => ({
    ...t,
    columnPreviewLabels: enableTabColumnPreview === true ? t.columnPreviewLabels : [],
    columnJumpItems: enableColumnJump === true ? t.columnJumpItems : [],
  }))

  return (
    <Table.Provider
      mode="independent"
      tabs={tabsForStore}
      activeTabId={activeTabId}
      defaultTabId={defaultTabId}
      onActiveTabChange={onActiveTabChange}
      indicatorLayoutId={tabIndicatorLayoutId}
      classNames={classNames}
      measure={measure}
      tabColumnPreviewDelayMs={tabColumnPreviewDelayMs}
      tabColumnPreviewPosition={tabColumnPreviewPosition}
      buildFilterBadges={buildFilterBadges}
      enableColumnJump={enableColumnJump === true}
      columnJumpIncludeHidden={columnJumpIncludeHidden ?? true}
      columnJumpGlobalShortcut={columnJumpGlobalShortcut === true}
    >
      <Table.Container>
        <Table.TabStrip
          centerContent={<Table.FilterBadges />}
          endContent={
            <>
              {actions}
              <Table.Search />
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
