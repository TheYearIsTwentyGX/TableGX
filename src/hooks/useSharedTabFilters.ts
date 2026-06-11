import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { isEmptyFilterValue, matchesFilterValue } from '../lib/filtering'
import type { ColumnFilterValue, GetRowId, TableRowData, TabbedTableTab } from '../types'

type AccessorMap<TRow> = Map<string, (row: TRow) => unknown>

function buildAccessors<TRow extends TableRowData>(
  columns: ColumnDef<TRow, unknown>[],
): AccessorMap<TRow> {
  const map: AccessorMap<TRow> = new Map()
  for (const col of columns) {
    const c = col as ColumnDef<TRow, unknown> & {
      accessorKey?: string
      accessorFn?: (row: TRow, index: number) => unknown
    }
    const id = c.id ?? c.accessorKey
    if (!id) continue
    if (c.accessorFn) {
      const fn = c.accessorFn
      map.set(id, (row) => fn(row, 0))
    } else if (c.accessorKey) {
      const key = c.accessorKey
      map.set(id, (row) => row[key])
    }
  }
  return map
}

function rowPasses<TRow extends TableRowData>(
  row: TRow,
  filters: { id: string; value: ColumnFilterValue }[],
  accessors: AccessorMap<TRow>,
  getSubRows?: (row: TRow) => TRow[] | undefined,
): boolean {
  const selfMatches = filters.every((f) => {
    const accessor = accessors.get(f.id)
    // Unknown column on this row shape — don't exclude.
    if (!accessor) return true
    return matchesFilterValue(accessor(row), f.value)
  })
  if (selfMatches) return true
  const subRows = getSubRows?.(row)
  if (!subRows) return false
  return subRows.some((child) => rowPasses(child, filters, accessors, getSubRows))
}

export type SharedTabFiltersResult<TRow extends TableRowData> = {
  filtersByTab: Record<string, ColumnFiltersState>
  setFiltersForTab: (
    tabId: string,
  ) => (updater: React.SetStateAction<ColumnFiltersState>) => void
  /** Rows passing every OTHER tab's filters (the tab's own filters apply inside its table). */
  dataForTab: (tabId: string) => TRow[]
  /** Active filters across all tabs, for the shared badge strip. */
  activeFilters: { tabId: string; columnId: string; value: ColumnFilterValue }[]
  clearFilter: (tabId: string, columnId: string) => void
  clearAll: () => void
}

/**
 * Cross-tab shared filtering (spec §18.3): each tab keeps its own
 * ColumnFiltersState; displayed rows are the intersection of the row-id sets
 * passing each tab's filters, keyed by `idColumn` / getRowId.
 */
export function useSharedTabFilters<TRow extends TableRowData>(options: {
  data: TRow[]
  getRowId: GetRowId<TRow>
  tabs: TabbedTableTab<TRow>[]
  getSubRows?: (row: TRow) => TRow[] | undefined
}): SharedTabFiltersResult<TRow> {
  const { data, getRowId, tabs, getSubRows } = options
  const [filtersByTab, setFiltersByTab] = useState<Record<string, ColumnFiltersState>>({})

  const setFiltersForTab = useCallback(
    (tabId: string) => (updater: React.SetStateAction<ColumnFiltersState>) => {
      setFiltersByTab((prev) => {
        const current = prev[tabId] ?? []
        const next = typeof updater === 'function' ? updater(current) : updater
        return { ...prev, [tabId]: next }
      })
    },
    [],
  )

  // Per-tab sets of top-level row ids passing that tab's filters.
  const passingSets = useMemo(() => {
    const sets = new Map<string, Set<string>>()
    for (const tab of tabs) {
      const filters = (filtersByTab[tab.id] ?? []).filter(
        (f) => !isEmptyFilterValue(f.value),
      ) as { id: string; value: ColumnFilterValue }[]
      if (filters.length === 0) continue
      const accessors = buildAccessors(tab.columns)
      const set = new Set<string>()
      for (const row of data) {
        if (rowPasses(row, filters, accessors, getSubRows)) set.add(String(getRowId(row)))
      }
      sets.set(tab.id, set)
    }
    return sets
  }, [tabs, filtersByTab, data, getRowId, getSubRows])

  const dataForTab = useCallback(
    (tabId: string): TRow[] => {
      const otherSets: Set<string>[] = []
      for (const [id, set] of passingSets) {
        if (id !== tabId) otherSets.push(set)
      }
      if (otherSets.length === 0) return data
      return data.filter((row) => {
        const id = String(getRowId(row))
        return otherSets.every((set) => set.has(id))
      })
    },
    [data, getRowId, passingSets],
  )

  const activeFilters = useMemo(() => {
    const out: { tabId: string; columnId: string; value: ColumnFilterValue }[] = []
    for (const tab of tabs) {
      for (const f of filtersByTab[tab.id] ?? []) {
        if (!isEmptyFilterValue(f.value)) {
          out.push({ tabId: tab.id, columnId: f.id, value: f.value as ColumnFilterValue })
        }
      }
    }
    return out
  }, [tabs, filtersByTab])

  const clearFilter = useCallback((tabId: string, columnId: string) => {
    setFiltersByTab((prev) => ({
      ...prev,
      [tabId]: (prev[tabId] ?? []).filter((f) => f.id !== columnId),
    }))
  }, [])

  const clearAll = useCallback(() => setFiltersByTab({}), [])

  return { filtersByTab, setFiltersForTab, dataForTab, activeFilters, clearFilter, clearAll }
}
