import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ColumnFiltersState } from '@tanstack/react-table'
import { describe, expect, it } from 'vitest'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import {
  IndependentTabbedTable,
  independentTable,
} from '../src/components/IndependentTabbedTable'
import { TabbedTable } from '../src/components/TabbedTable'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn, TabbedTableTab } from '../src/types'

const measure: MeasureTextFn = (text) => text.length * 8

type Row = { id: string; name: string; city: string }

const data: Row[] = [
  { id: '1', name: 'Bravo', city: 'Madrid' },
  { id: '2', name: 'Alpha', city: 'Zurich' },
  { id: '3', name: 'Cairo', city: 'Lima' },
]

const columns = [textColumn<Row>('name', 'Name'), textColumn<Row>('city', 'City')]

/** The active panel is the last table; exiting panels can linger mid-animation. */
function activeTable(container: HTMLElement): HTMLElement {
  const panels = container.querySelectorAll<HTMLElement>('[data-tgx-table]')
  return panels[panels.length - 1]!
}

describe('record count (ReadOnlyTable)', () => {
  it('is hidden by default', () => {
    const { container } = render(
      <ReadOnlyTable<Row>
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        measure={measure}
      />,
    )
    expect(container.querySelector('[data-tgx-record-count]')).toBeNull()
  })

  it('shows a single total when enabled and unfiltered', () => {
    const { container } = render(
      <ReadOnlyTable<Row>
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        measure={measure}
        enableRecordCount
      />,
    )
    const el = container.querySelector('[data-tgx-record-count]')
    expect(el).not.toBeNull()
    expect(el).toHaveTextContent('3 rows')
  })

  it('keeps a single total when a filter is active but does not narrow the set', () => {
    const columnFilters: ColumnFiltersState = [
      { id: 'name', value: { text: 'a', checkedValues: null } },
    ]
    const { container } = render(
      <ReadOnlyTable<Row>
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        measure={measure}
        enableRecordCount
        columnFilters={columnFilters}
        onColumnFiltersChange={() => {}}
      />,
    )
    // "Bravo", "Alpha", "Cairo" all contain "a" → nothing is narrowed.
    expect(container.querySelector('[data-tgx-record-count]')).toHaveTextContent('3 rows')
  })

  it('reads "Showing X of Y" with the filtered subset', () => {
    const columnFilters: ColumnFiltersState = [
      { id: 'city', value: { text: 'Lima', checkedValues: null } },
    ]
    const { container } = render(
      <ReadOnlyTable<Row>
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        measure={measure}
        enableRecordCount
        columnFilters={columnFilters}
        onColumnFiltersChange={() => {}}
      />,
    )
    expect(container.querySelector('[data-tgx-record-count]')).toHaveTextContent('Showing 1 of 3')
  })

  it('formats large totals with thousands separators', () => {
    const big: Row[] = Array.from({ length: 1234 }, (_, i) => ({
      id: String(i),
      name: `Name ${i}`,
      city: `City ${i}`,
    }))
    const { container } = render(
      <ReadOnlyTable<Row>
        data={big}
        columns={columns}
        getRowId={(r) => r.id}
        measure={measure}
        enableRecordCount
      />,
    )
    expect(container.querySelector('[data-tgx-record-count]')).toHaveTextContent('1,234 rows')
  })

  it('renders the count in the toolbar region when position is "top"', () => {
    const { container } = render(
      <ReadOnlyTable<Row>
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        measure={measure}
        enableRecordCount
        recordCountPosition="top"
      />,
    )
    const toolbar = container.querySelector('[data-tgx-toolbar]')
    expect(toolbar).not.toBeNull()
    expect(toolbar!.querySelector('[data-tgx-record-count]')).not.toBeNull()
  })

  it('renders a floated bottom-right annotation when position is "bottom"', () => {
    const { container } = render(
      <ReadOnlyTable<Row>
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        measure={measure}
        enableRecordCount
        recordCountPosition="bottom"
      />,
    )
    const count = container.querySelector('[data-tgx-record-count]')
    expect(count).not.toBeNull()
    expect(count).toHaveTextContent('3 rows')
    // Floated over the corner, not a strip inside the toolbar.
    expect(count!.classList.contains('absolute')).toBe(true)
    // Must not be picked up as the virtualized body scroll container.
    expect(count!.classList.contains('tgx-scrollbar')).toBe(false)
    // No toolbar row is forced for a bottom-placed count.
    expect(container.querySelector('[data-tgx-toolbar]')).toBeNull()
  })

  it('honors a consumer label override', () => {
    const { container } = render(
      <ReadOnlyTable<Row>
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        measure={measure}
        enableRecordCount
        recordCountLabel={({ total }) => `${total} records`}
      />,
    )
    expect(container.querySelector('[data-tgx-record-count]')).toHaveTextContent('3 records')
  })

  it('applies a class override to the count region', () => {
    const { container } = render(
      <ReadOnlyTable<Row>
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        measure={measure}
        enableRecordCount
        classNames={{ recordCount: 'my-count' }}
      />,
    )
    expect(container.querySelector('[data-tgx-record-count]')!.classList.contains('my-count')).toBe(
      true,
    )
  })
})

const tabbedTabs: TabbedTableTab<Row>[] = [
  {
    id: 'a',
    label: 'Tab A',
    columns: [textColumn<Row>('name', 'Name'), textColumn<Row>('city', 'City')],
  },
  { id: 'b', label: 'Tab B', columns: [textColumn<Row>('name', 'Name')] },
]

describe('record count (TabbedTable)', () => {
  it('reflects the active tab data in the tab strip (top placement)', async () => {
    const { container } = render(
      <TabbedTable<Row>
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabbedTabs}
        defaultTabId="a"
        measure={measure}
        enableRecordCount
      />,
    )
    // Top-placed counts live in the tab strip, not a second toolbar row in the
    // panel — and arrive via the panel's onRecordCountChange callback.
    await waitFor(() =>
      expect(container.querySelector('[data-tgx-record-count]')).toHaveTextContent('3 rows'),
    )
    expect(activeTable(container).querySelector('[data-tgx-record-count]')).toBeNull()
  })

  it('floats a bottom-right annotation inside the panel when position is "bottom"', () => {
    const { container } = render(
      <TabbedTable<Row>
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabbedTabs}
        defaultTabId="a"
        measure={measure}
        enableRecordCount
        recordCountPosition="bottom"
      />,
    )
    const count = activeTable(container).querySelector('[data-tgx-record-count]')
    expect(count).not.toBeNull()
    expect(count).toHaveTextContent('3 rows')
    expect(count!.classList.contains('absolute')).toBe(true)
  })
})

describe('record count (IndependentTabbedTable)', () => {
  type Person = { id: string; name: string }
  type Order = { ref: string; total: number }

  const people: Person[] = [
    { id: '1', name: 'Bravo' },
    { id: '2', name: 'Alpha' },
  ]
  const orders: Order[] = [
    { ref: 'A-100', total: 50 },
    { ref: 'A-200', total: 10 },
    { ref: 'A-300', total: 20 },
  ]

  it('shows each tab its own count', async () => {
    const user = userEvent.setup()
    const tabs = [
      independentTable<Person>({
        id: 'people',
        label: 'People',
        data: people,
        getRowId: (r) => r.id,
        columns: [textColumn<Person>('name', 'Name')],
        measure,
        enableRecordCount: true,
      }),
      independentTable<Order>({
        id: 'orders',
        label: 'Orders',
        data: orders,
        getRowId: (r) => r.ref,
        columns: [textColumn<Order>('ref', 'Ref')],
        measure,
        enableRecordCount: true,
      }),
    ]
    const { container, getByRole } = render(
      <IndependentTabbedTable tabs={tabs} defaultTabId="people" />,
    )
    // Counts default to top placement → rendered in the shared tab strip.
    await waitFor(() =>
      expect(container.querySelector('[data-tgx-record-count]')).toHaveTextContent('2 rows'),
    )

    await user.click(getByRole('button', { name: 'Orders' }))
    await waitFor(() =>
      expect(container.querySelector('[data-tgx-record-count]')).toHaveTextContent('3 rows'),
    )
  })
})
