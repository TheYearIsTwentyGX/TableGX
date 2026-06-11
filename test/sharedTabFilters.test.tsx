import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSharedTabFilters } from '../src/hooks/useSharedTabFilters'
import { textColumn } from '../src/lib/columns'
import type { TabbedTableTab } from '../src/types'

type Row = { id: string; name: string; state: string; children?: Row[] }

const data: Row[] = [
  { id: '1', name: 'Alpha', state: 'TX' },
  { id: '2', name: 'Beta', state: 'CA' },
  { id: '3', name: 'Gamma', state: 'TX' },
]

const tabs: TabbedTableTab<Row>[] = [
  { id: 'a', label: 'Tab A', columns: [textColumn<Row>('name', 'Name')] },
  { id: 'b', label: 'Tab B', columns: [textColumn<Row>('state', 'State')] },
]

function setup(rows = data, getSubRows?: (r: Row) => Row[] | undefined) {
  return renderHook(() =>
    useSharedTabFilters<Row>({ data: rows, getRowId: (r) => r.id, tabs, getSubRows }),
  )
}

describe('useSharedTabFilters', () => {
  it('narrows other tabs to the intersection (filter on A restricts B)', () => {
    const { result } = setup()
    act(() => {
      result.current.setFiltersForTab('b')([
        { id: 'state', value: { text: '', checkedValues: new Set(['TX']) } },
      ])
    })
    // Tab A displays rows passing tab B's filter even though A doesn't show `state`.
    expect(result.current.dataForTab('a').map((r) => r.id)).toEqual(['1', '3'])
    // Tab B's own filter applies inside its table, so dataForTab('b') is unrestricted.
    expect(result.current.dataForTab('b').map((r) => r.id)).toEqual(['1', '2', '3'])
  })

  it('intersects across multiple tabs', () => {
    const { result } = setup()
    act(() => {
      result.current.setFiltersForTab('a')([
        { id: 'name', value: { text: 'a', checkedValues: null } },
      ])
      result.current.setFiltersForTab('b')([
        { id: 'state', value: { text: '', checkedValues: new Set(['CA']) } },
      ])
    })
    // From a third perspective both filters apply: name contains 'a' AND state CA → Beta.
    expect(result.current.dataForTab('c').map((r) => r.id)).toEqual(['2'])
  })

  it('keeps parents whose descendants match (nested rows participate)', () => {
    const nested: Row[] = [
      {
        id: 'p',
        name: 'Parent',
        state: 'NY',
        children: [{ id: 'p.1', name: 'Child', state: 'TX' }],
      },
      { id: 'q', name: 'Other', state: 'CA' },
    ]
    const { result } = setup(nested, (r) => r.children)
    act(() => {
      result.current.setFiltersForTab('b')([
        { id: 'state', value: { text: '', checkedValues: new Set(['TX']) } },
      ])
    })
    expect(result.current.dataForTab('a').map((r) => r.id)).toEqual(['p'])
  })

  it('clears filters via clearFilter and clearAll', () => {
    const { result } = setup()
    act(() => {
      result.current.setFiltersForTab('a')([
        { id: 'name', value: { text: 'x', checkedValues: null } },
      ])
    })
    expect(result.current.activeFilters).toHaveLength(1)
    act(() => result.current.clearFilter('a', 'name'))
    expect(result.current.activeFilters).toHaveLength(0)

    act(() => {
      result.current.setFiltersForTab('a')([
        { id: 'name', value: { text: 'x', checkedValues: null } },
      ])
      result.current.setFiltersForTab('b')([
        { id: 'state', value: { text: 'T', checkedValues: null } },
      ])
    })
    act(() => result.current.clearAll())
    expect(result.current.activeFilters).toHaveLength(0)
    expect(result.current.dataForTab('a')).toHaveLength(3)
  })
})
