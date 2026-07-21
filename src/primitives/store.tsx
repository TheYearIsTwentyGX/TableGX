import type { MotionValue } from 'framer-motion'
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { OnChangeFn, SortingState, VisibilityState } from '@tanstack/react-table'
import type { ColumnVisibilityItem } from '../core/ColumnVisibilityPicker'
import type { FilterBadgeItem } from '../core/FilterBadges'
import { useSharedTabFilters } from '../hooks/useSharedTabFilters'
import type { ColumnJumpEntry, RecordCountInfo } from '../types'
import type {
  TableBodyRenderArgs,
  TableProviderConfig,
  TableStore,
  TableTabModel,
} from './types'

const TableStoreContext = createContext<TableStore | null>(null)

const noopVisibilityChange: OnChangeFn<VisibilityState> = () => {}

/** Read the headless table store. Throws when used outside a `TableProvider`. */
export function useTableStore(): TableStore {
  const store = useContext(TableStoreContext)
  if (!store) {
    throw new Error('useTableStore must be used within a <Table.Provider>')
  }
  return store
}

/** Read a tab's persisted column visibility (best-effort, SSR-safe). */
function readStoredVisibility(tabs: TableTabModel[]): Record<string, VisibilityState> {
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

export type TableProviderProps = TableProviderConfig & { children: ReactNode }

/**
 * The headless root: owns all cross-cutting tabbed-table state (active tab,
 * sorting, filters, selection, per-tab column visibility) with no UI of its
 * own, and exposes it to the compound primitives via context. A `mode` selects
 * shared-dataset vs fully-independent semantics.
 */
export function TableProvider({ children, ...config }: TableProviderProps) {
  const {
    mode,
    tabs,
    activeTabId: controlledActiveId,
    defaultTabId,
    onActiveTabChange,
    classNames,
    measure,
    tabColumnPreviewDelayMs,
    tabColumnPreviewPosition,
    enableRowSelection = false,
    selectedRowIds,
    onSelectedRowIdsChange,
    sharedFilterSource,
    buildFilterBadges,
    enableSortHierarchy = false,
    resolveSortLabel,
    enableColumnJump,
    columnJumpIncludeHidden,
    columnJumpGlobalShortcut,
  } = config

  const autoLayoutId = useId()
  const indicatorLayoutId = config.indicatorLayoutId ?? `tgx-tab-indicator-${autoLayoutId}`

  // ----- Active tab (resolved to a real tab so a panel always renders) -----
  const [internalActiveId, setInternalActiveId] = useState(
    defaultTabId ?? tabs[0]?.id ?? '',
  )
  const rawActiveId = controlledActiveId ?? internalActiveId
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === rawActiveId),
  )
  const activeId = tabs[activeIndex]?.id ?? ''
  const activeTab = tabs[activeIndex]

  const selectTab = useCallback(
    (id: string) => {
      if (id === activeId) return
      if (controlledActiveId === undefined) setInternalActiveId(id)
      onActiveTabChange?.(id)
    },
    [activeId, controlledActiveId, onActiveTabChange],
  )

  // ----- Shared sorting (shared mode) -----
  const [sharedSorting, setSharedSorting] = useState<SortingState>(() => {
    const initiallyActive = tabs.find(
      (t) => t.id === (controlledActiveId ?? defaultTabId ?? tabs[0]?.id),
    )
    return (
      initiallyActive?.initialSorting ?? tabs.find((t) => t.initialSorting)?.initialSorting ?? []
    )
  })
  // ----- Per-tab sorting (independent mode) -----
  const [sortingByTab, setSortingByTab] = useState<Record<string, SortingState>>({})

  const getSorting = useCallback(
    (tabId: string): SortingState => {
      if (mode === 'shared') return sharedSorting
      const tab = tabs.find((t) => t.id === tabId)
      return sortingByTab[tabId] ?? tab?.initialSorting ?? []
    },
    [mode, sharedSorting, sortingByTab, tabs],
  )

  // The curried per-tab setters below cache the inner closure per tab id so
  // repeated calls (getBodyArgs runs on every store render) hand TableCore the
  // same onSortingChange/onGlobalSearchChange/etc. identity instead of a fresh
  // closure each time.
  const setSorting = useMemo(() => {
    const cache = new Map<string, OnChangeFn<SortingState>>()
    return (tabId: string): OnChangeFn<SortingState> => {
      let fn = cache.get(tabId)
      if (!fn) {
        fn = (updater) => {
          if (mode === 'shared') {
            setSharedSorting((prev) => (typeof updater === 'function' ? updater(prev) : updater))
            return
          }
          setSortingByTab((prev) => {
            const tab = tabs.find((t) => t.id === tabId)
            const current = prev[tabId] ?? tab?.initialSorting ?? []
            return { ...prev, [tabId]: typeof updater === 'function' ? updater(current) : updater }
          })
        }
        cache.set(tabId, fn)
      }
      return fn
    }
  }, [mode, tabs])

  // ----- Global search (shared value in shared mode; per-tab in independent) -----
  const [sharedSearch, setSharedSearchState] = useState('')
  const [searchByTab, setSearchByTab] = useState<Record<string, string>>({})

  const getSearch = useCallback(
    (tabId: string): string => {
      if (mode === 'shared') return sharedSearch
      return searchByTab[tabId] ?? ''
    },
    [mode, sharedSearch, searchByTab],
  )

  const setSearch = useMemo(() => {
    const cache = new Map<string, (value: string) => void>()
    return (tabId: string) => {
      let fn = cache.get(tabId)
      if (!fn) {
        fn = (value) => {
          if (mode === 'shared') {
            setSharedSearchState(value)
            return
          }
          setSearchByTab((prev) => ({ ...prev, [tabId]: value }))
        }
        cache.set(tabId, fn)
      }
      return fn
    }
  }, [mode])

  // ----- Selection (shared group-level vs per-tab) -----
  const [internalSelected, setInternalSelected] = useState<string[]>([])
  const sharedSelected = enableRowSelection ? (selectedRowIds ?? internalSelected) : undefined
  const handleSharedSelectedChange = useCallback(
    (ids: string[]) => {
      setInternalSelected(ids)
      onSelectedRowIdsChange?.(ids)
    },
    [onSelectedRowIdsChange],
  )
  const [selectionByTab, setSelectionByTab] = useState<Record<string, string[]>>({})

  const getSelection = useCallback(
    (tabId: string): string[] | undefined => {
      if (mode === 'shared') return sharedSelected
      const tab = tabs.find((t) => t.id === tabId)
      if (!tab?.enableRowSelection) return undefined
      return tab.selectedRowIds ?? selectionByTab[tabId] ?? []
    },
    [mode, sharedSelected, selectionByTab, tabs],
  )

  const setSelection = useMemo(() => {
    const cache = new Map<string, (ids: string[]) => void>()
    return (tabId: string) => {
      let fn = cache.get(tabId)
      if (!fn) {
        fn = (ids) => {
          if (mode === 'shared') {
            handleSharedSelectedChange(ids)
            return
          }
          const tab = tabs.find((t) => t.id === tabId)
          if (tab?.selectedRowIds !== undefined) {
            tab.onSelectedRowIdsChange?.(ids)
            return
          }
          setSelectionByTab((prev) => ({ ...prev, [tabId]: ids }))
        }
        cache.set(tabId, fn)
      }
      return fn
    }
  }, [mode, tabs, handleSharedSelectedChange])

  // ----- Filters (per-tab in both modes; intersected for display in shared mode) -----
  const filterSource = sharedFilterSource ?? { data: [], getRowId: (r: unknown) => r, tabs: [] }
  const {
    filtersByTab,
    setFiltersForTab,
    dataForTab,
    activeFilters,
    clearFilter,
    clearAll,
  } = useSharedTabFilters({
    // The hook only reads `tabs`/`data` for the intersection used in shared mode;
    // in independent mode they are empty and only its per-tab filter store is used.
    data: filterSource.data as never[],
    getRowId: filterSource.getRowId as (row: never) => string,
    tabs: filterSource.tabs as never[],
    getSubRows: sharedFilterSource?.getSubRows as
      | ((row: never) => never[] | undefined)
      | undefined,
  })

  // ----- Per-tab column visibility, persisted under each tab's storage key -----
  const [visibilityByTab, setVisibilityByTab] = useState<Record<string, VisibilityState>>(() =>
    readStoredVisibility(tabs),
  )

  const getVisibility = useCallback(
    (tabId: string): VisibilityState => visibilityByTab[tabId] ?? {},
    [visibilityByTab],
  )

  // Keyed on `tabs` (not just tab.id): the closure captures the tab object for
  // its columnVisibilityStorageKey, so a changed tab definition must bust it.
  const setVisibility = useMemo(() => {
    const cache = new Map<string, OnChangeFn<VisibilityState>>()
    return (tab: TableTabModel): OnChangeFn<VisibilityState> => {
      let fn = cache.get(tab.id)
      if (!fn) {
        fn = (updater) => {
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
          })
        }
        cache.set(tab.id, fn)
      }
      return fn
    }
  }, [tabs])

  // ----- Column jump (Ctrl+G / Cmd+G) -----

  const columnJumpEntriesByTab = useMemo(() => {
    const out: Record<string, ColumnJumpEntry[]> = {}
    for (const tab of tabs) {
      if (tab.columnJumpItems.length === 0) {
        out[tab.id] = []
        continue
      }
      const tabVisibility = getVisibility(tab.id)
      out[tab.id] = tab.columnJumpItems
        .map((item) => ({
          columnId: item.id,
          label: item.label,
          hidden: tabVisibility[item.id] === false,
          tabId: tab.id,
          tabLabel: tab.label,
        }))
        .filter((entry) => columnJumpIncludeHidden !== false || !entry.hidden)
    }
    return out
  }, [tabs, getVisibility, columnJumpIncludeHidden])

  const columnJumpForeignEntries = useMemo(
    () =>
      tabs
        .filter((tab) => tab.id !== activeId)
        .flatMap((tab) => columnJumpEntriesByTab[tab.id] ?? []),
    [tabs, activeId, columnJumpEntriesByTab],
  )

  const [pendingScrollColumnId, setPendingScrollColumnId] = useState<string | null>(null)

  const jumpToForeignColumn = useCallback(
    (entry: ColumnJumpEntry) => {
      if (entry.tabId === undefined) return
      if (entry.hidden) {
        const targetTab = tabs.find((t) => t.id === entry.tabId)
        if (targetTab) {
          setVisibility(targetTab)((prev) => ({ ...prev, [entry.columnId]: true }))
        }
      }
      selectTab(entry.tabId)
      setPendingScrollColumnId(entry.columnId)
    },
    [tabs, setVisibility, selectTab],
  )

  // ----- Top-placed record count, lifted from the active panel to the strip -----
  const [recordCountInfo, setRecordCountInfo] = useState<RecordCountInfo | null>(null)

  const getBodyArgs = useCallback(
    (pinnedPaneX?: MotionValue<number>): TableBodyRenderArgs => {
      const tab = activeTab
      const tabId = tab?.id ?? ''
      return {
        sorting: getSorting(tabId),
        onSortingChange: setSorting(tabId),
        columnFilters: filtersByTab[tabId] ?? [],
        onColumnFiltersChange: setFiltersForTab(tabId),
        visibility: getVisibility(tabId),
        onVisibilityChange: tab ? setVisibility(tab) : noopVisibilityChange,
        globalSearch: getSearch(tabId),
        onGlobalSearchChange: setSearch(tabId),
        selectedRowIds: getSelection(tabId),
        onSelectedRowIdsChange: setSelection(tabId),
        sharedData: mode === 'shared' && tab ? dataForTab(tabId) : undefined,
        allFilters: filtersByTab,
        measure,
        classNames,
        recordCountInToolbar: tab?.showsTopRecordCount ? false : undefined,
        onRecordCountChange: tab?.showsTopRecordCount ? setRecordCountInfo : undefined,
        pinnedPaneX,
        columnJumpForeignEntries,
        onJumpToForeignColumn: jumpToForeignColumn,
        scrollToColumnId: pendingScrollColumnId,
        onScrollToColumnHandled: () => setPendingScrollColumnId(null),
        columnJumpEnabled: enableColumnJump === true,
        columnJumpIncludeHiddenResolved: columnJumpIncludeHidden ?? true,
        columnJumpGlobalShortcutResolved: columnJumpGlobalShortcut === true,
      }
    },
    [
      activeTab,
      getSorting,
      setSorting,
      filtersByTab,
      setFiltersForTab,
      getVisibility,
      setVisibility,
      getSearch,
      setSearch,
      getSelection,
      setSelection,
      mode,
      dataForTab,
      measure,
      classNames,
      columnJumpForeignEntries,
      jumpToForeignColumn,
      pendingScrollColumnId,
      enableColumnJump,
      columnJumpIncludeHidden,
      columnJumpGlobalShortcut,
    ],
  )

  // ----- Chrome derivations -----
  //
  // Each derivation is memoized so it can serve as a stable dep of the store
  // useMemo below — otherwise the fresh object per render would defeat it.
  const filterBadges: FilterBadgeItem[] = useMemo(
    () =>
      buildFilterBadges
        ? buildFilterBadges({ activeId, filtersByTab, activeFilters, clearFilter })
        : [],
    [buildFilterBadges, activeId, filtersByTab, activeFilters, clearFilter],
  )

  // Shared mode clears every tab's filters; independent mode clears only the
  // active tab (each tab being its own table).
  const clearAllFilters = useCallback(() => {
    if (mode === 'shared') clearAll()
    else setFiltersForTab(activeId)([])
  }, [mode, clearAll, setFiltersForTab, activeId])

  const pickerItems: ColumnVisibilityItem[] = useMemo(
    () => (activeTab ? activeTab.getPickerItems(getVisibility(activeTab.id)) : []),
    [activeTab, getVisibility],
  )

  const togglePickerItem = useCallback(
    (id: string, visible: boolean) => {
      if (!activeTab) return
      setVisibility(activeTab)((prev) => ({ ...prev, [id]: visible }))
    },
    [activeTab, setVisibility],
  )

  const setAllPickerItems = useCallback(
    (visible: boolean) => {
      if (!activeTab) return
      const ids = pickerItems.map((i) => i.id)
      if (ids.length === 0) return
      setVisibility(activeTab)((prev) => {
        const next = { ...prev }
        for (const id of ids) next[id] = visible
        return next
      })
    },
    [activeTab, setVisibility, pickerItems],
  )

  const sortControl = useMemo(
    () =>
      enableSortHierarchy && mode === 'shared'
        ? {
            sorting: sharedSorting,
            resolveLabel: resolveSortLabel ?? ((id: string) => id),
            onChange: setSharedSorting,
          }
        : null,
    [enableSortHierarchy, mode, sharedSorting, resolveSortLabel],
  )

  const search = useMemo(
    () =>
      activeTab?.enableGlobalSearch === true
        ? {
            value: getSearch(activeId),
            onChange: setSearch(activeId),
            placeholder: activeTab.searchPlaceholder,
          }
        : null,
    [activeTab, activeId, getSearch, setSearch],
  )

  const recordCount = useMemo(
    () =>
      activeTab?.showsTopRecordCount === true
        ? { info: recordCountInfo, label: activeTab.recordCountLabel }
        : null,
    [activeTab, recordCountInfo],
  )

  // Memoized so a state change in one slice doesn't hand every context
  // consumer a fresh store object (context re-renders all consumers whenever
  // the provider value's identity changes).
  const store: TableStore = useMemo(
    () => ({
      mode,
      tabs,
      activeId,
      activeTab,
      selectTab,
      indicatorLayoutId,
      classNames,
      tabColumnPreviewDelayMs,
      tabColumnPreviewPosition,
      getBodyArgs,
      filterBadges,
      clearAllFilters,
      pickerItems,
      togglePickerItem,
      setAllPickerItems,
      sortControl,
      search,
      recordCount,
    }),
    [
      mode,
      tabs,
      activeId,
      activeTab,
      selectTab,
      indicatorLayoutId,
      classNames,
      tabColumnPreviewDelayMs,
      tabColumnPreviewPosition,
      getBodyArgs,
      filterBadges,
      clearAllFilters,
      pickerItems,
      togglePickerItem,
      setAllPickerItems,
      sortControl,
      search,
      recordCount,
    ],
  )

  return <TableStoreContext.Provider value={store}>{children}</TableStoreContext.Provider>
}
