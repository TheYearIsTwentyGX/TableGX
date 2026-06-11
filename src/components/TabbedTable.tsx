import type { ColumnDef, OnChangeFn, SortingState, VisibilityState } from '@tanstack/react-table'
import { AnimatePresence, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import * as React from 'react'
import { useCallback, useId, useRef, useState } from 'react'
import { ColumnVisibilityPicker } from '../core/ColumnVisibilityPicker'
import { describeFilterValue, FilterBadges, type FilterBadgeItem } from '../core/FilterBadges'
import { TableCore } from '../core/TableCore'
import { getColumnId } from '../hooks/useAutoColumnWidths'
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect'
import { useSharedTabFilters } from '../hooks/useSharedTabFilters'
import { cn } from '../lib/cn'
import type { TabbedTableProps, TabbedTableTab, TableRowData } from '../types'

const slideTransition = { type: 'spring', stiffness: 320, damping: 34 } as const

type SlideCustom = { dir: number; width: number }

const panelVariants = {
  enter: ({ dir, width }: SlideCustom) => ({ x: dir > 0 ? width : -width }),
  center: { x: 0 },
  exit: ({ dir, width }: SlideCustom) => ({ x: dir > 0 ? -width : width }),
}

function TabPanel({
  custom,
  onSettled,
  children,
}: {
  custom: SlideCustom
  onSettled: () => void
  children: (pinnedPaneX: MotionValue<number>) => React.ReactNode
}) {
  const x = useMotionValue(0)
  // Negate the slide translate so the pinned pane appears static (spec §18.5).
  const pinnedPaneX = useTransform(x, (v) => -v)
  return (
    <motion.div
      className="absolute inset-0 flex min-h-0 min-w-0 flex-col"
      style={{ x }}
      custom={custom}
      variants={panelVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={slideTransition}
      onAnimationComplete={(definition) => {
        if (definition === 'center') onSettled()
      }}
    >
      {children(pinnedPaneX)}
    </motion.div>
  )
}

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

  // ----- Active tab + slide direction -----

  const [internalActiveId, setInternalActiveId] = useState(defaultTabId ?? tabs[0]?.id ?? '')
  const activeId = controlledActiveId ?? internalActiveId
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeId),
  )
  const activeTab = tabs[activeIndex]

  const prevRef = useRef({ id: activeId, index: activeIndex })
  const dirRef = useRef(1)
  if (prevRef.current.id !== activeId) {
    dirRef.current = activeIndex >= prevRef.current.index ? 1 : -1
    prevRef.current = { id: activeId, index: activeIndex }
  }
  const direction = dirRef.current

  // Native scrollbars are hidden mid-slide so they don't sweep across the
  // visually-static frozen pane. This must flip synchronously (render-phase
  // update) in the same commit that swaps panels: AnimatePresence freezes the
  // exiting panel's props, so the suppression class lives on the shared
  // panels container instead of the panels themselves.
  const [isSliding, setIsSliding] = useState(false)
  const [slideTracker, setSlideTracker] = useState(activeId)
  if (slideTracker !== activeId) {
    setSlideTracker(activeId)
    setIsSliding(true)
  }
  const handleSlideSettled = useCallback(() => setIsSliding(false), [])

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
  // One SortingState for the whole tab group, like selection: a sort applied
  // on any tab carries to every other tab. TanStack ignores sort entries for
  // columns a tab doesn't have, so disjoint column sets are safe. Seeded from
  // the initially-active tab's initialSorting (falling back to the first tab
  // that defines one).

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

  // ----- Panel width (pixel-based slide so the negation transform is exact) -----

  const panelsRef = useRef<HTMLDivElement | null>(null)
  const [panelWidth, setPanelWidth] = useState(0)
  useIsomorphicLayoutEffect(() => {
    const el = panelsRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setPanelWidth(el.clientWidth))
    observer.observe(el)
    setPanelWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const slideCustom: SlideCustom = { dir: direction, width: panelWidth || 1280 }

  return (
    <div
      data-tgx-tabbed-table=""
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card',
        classNames?.container,
      )}
    >
      {/* --- Tab strip (folder-tab look, styling guide §1) --- */}
      <div
        data-tgx-tab-strip=""
        className={cn(
          'flex shrink-0 items-stretch gap-3 border-b border-border bg-muted/40 pr-2',
          classNames?.tabStrip,
        )}
      >
        <div className="flex shrink-0 items-end">
          {tabs.map((tab) => {
            const isActive = tab.id === activeId
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={cn(
                  'relative -mb-px rounded-t-md border-x border-t px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? cn('border-border bg-card text-foreground', classNames?.activeTab)
                    : cn(
                        'border-transparent bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                        classNames?.inactiveTab,
                      ),
                  classNames?.tab,
                )}
              >
                {isActive && (
                  <span aria-hidden className="absolute inset-x-0 -bottom-px h-px bg-card" />
                )}
                {isActive && (
                  <motion.span
                    layoutId={indicatorLayoutId}
                    className={cn(
                      'absolute inset-x-0 bottom-0 z-10 h-0.5 bg-primary',
                      classNames?.tabIndicator,
                    )}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            )
          })}
        </div>
        {/* --- Shared filter badges across all tabs, inline in the strip --- */}
        <div className="flex min-w-0 flex-1 items-center justify-end self-center overflow-hidden">
          <FilterBadges
            items={badgeItems}
            onClearAll={clearAll}
            className={cn('flex-nowrap border-b-0 p-0', classNames?.filterBadges)}
          />
        </div>
        {hasActions && (
          <div className="flex shrink-0 items-center gap-2 self-center">
            {actions}
            {pickerItems.length > 0 && activeTab && (
              <ColumnVisibilityPicker
                items={pickerItems}
                onToggle={(id, visible) => {
                  makeVisibilityHandler(activeTab)((prev) => ({ ...prev, [id]: visible }))
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* --- Sliding tab panels --- */}
      <div
        ref={panelsRef}
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          isSliding && 'tgx-sliding',
          classNames?.panel,
        )}
      >
        <AnimatePresence initial={false} custom={slideCustom}>
          {activeTab && (
            <TabPanel key={activeTab.id} custom={slideCustom} onSettled={handleSlideSettled}>
              {(pinnedPaneX) => (
                <TableCore<TRow>
                  data={dataForTab(activeTab.id)}
                  columns={activeTab.columns}
                  getRowId={getRowId}
                  editable={activeTab.editable === true}
                  editableColumnIds={
                    activeTab.editable === true ? activeTab.editableColumnIds : undefined
                  }
                  onSaveEdit={activeTab.editable === true ? activeTab.onSaveEdit : undefined}
                  singleClickEdit={
                    activeTab.editable === true ? activeTab.singleClickEdit : undefined
                  }
                  columnGroups={activeTab.editable === true ? activeTab.columnGroups : undefined}
                  getCellClassName={
                    activeTab.editable === true ? activeTab.getCellClassName : undefined
                  }
                  isSubmitting={activeTab.editable === true ? activeTab.isSubmitting : undefined}
                  bordered={false}
                  frozenColumns={activeTab.frozenColumns ?? 0}
                  controlledSorting={sharedSorting}
                  onControlledSortingChange={handleSortingChange}
                  columnLabel={
                    activeTab.columnLabel ?? ((id) => columnLabelFor(activeTab, id))
                  }
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
                  measure={measure}
                  classNames={classNames}
                  pinnedPaneX={pinnedPaneX}
                />
              )}
            </TabPanel>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
