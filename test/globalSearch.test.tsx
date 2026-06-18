import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { TabbedTable } from '../src/components/TabbedTable'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn, TableColumnMeta } from '../src/types'

type Row = { id: string; name: string; city: string }

const measure: MeasureTextFn = (text) => text.length * 8

const data: Row[] = [
  { id: '1', name: 'Avocado', city: 'Lima' },
  { id: '2', name: 'Banana', city: 'Quito' },
  { id: '3', name: 'Cherry', city: 'Avon' },
]

const columns = [textColumn<Row>('name', 'Name'), textColumn<Row>('city', 'City')]

// jsdom reports zero-sized elements, so the virtualizer renders nothing. Give
// elements a size for the duration of `fn`, then restore the descriptors.
async function withElementSize(fn: () => Promise<void>) {
  const sizeProps = {
    offsetWidth: { configurable: true, get: () => 800 },
    offsetHeight: { configurable: true, get: () => 400 },
    clientWidth: { configurable: true, get: () => 800 },
    clientHeight: { configurable: true, get: () => 400 },
  }
  const originals = Object.fromEntries(
    Object.keys(sizeProps).map((k) => [
      k,
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, k) ??
        Object.getOwnPropertyDescriptor(Element.prototype, k),
    ]),
  )
  for (const [k, d] of Object.entries(sizeProps)) {
    Object.defineProperty(HTMLElement.prototype, k, d)
  }
  try {
    await fn()
  } finally {
    for (const k of Object.keys(sizeProps)) {
      const orig = originals[k]
      if (orig) Object.defineProperty(HTMLElement.prototype, k, orig)
      else Reflect.deleteProperty(HTMLElement.prototype, k)
    }
  }
}

describe('global search — single table', () => {
  it('is absent by default', () => {
    render(
      <ReadOnlyTable<Row>
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight="400px"
        measure={measure}
      />,
    )
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('renders the input when enabled and filters rows by includes across all columns', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          maxHeight="400px"
          measure={measure}
          enableGlobalSearch
        />,
      )
      const box = screen.getByRole('searchbox')
      // "avo" hits the name "Avocado" (row 1) and the city "Avon" (row 3).
      await user.type(box, 'avo')
      await waitFor(() => {
        expect(screen.getByText('Avocado')).toBeInTheDocument()
        expect(screen.getByText('Cherry')).toBeInTheDocument()
        expect(screen.queryByText('Banana')).toBeNull()
      })
    })
  })

  it('clear button empties the query and restores all rows', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          maxHeight="400px"
          measure={measure}
          enableGlobalSearch
        />,
      )
      const box = screen.getByRole('searchbox')
      await user.type(box, 'banana')
      await waitFor(() => expect(screen.queryByText('Avocado')).toBeNull())
      await user.click(screen.getByRole('button', { name: 'Clear search' }))
      await waitFor(() => {
        expect(screen.getByText('Avocado')).toBeInTheDocument()
        expect(screen.getByText('Banana')).toBeInTheDocument()
      })
    })
  })

  it('uses a custom placeholder', () => {
    render(
      <ReadOnlyTable<Row>
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight="400px"
        measure={measure}
        enableGlobalSearch
        searchPlaceholder="Find a fruit"
      />,
    )
    expect(screen.getByPlaceholderText('Find a fruit')).toBeInTheDocument()
  })

  it('searchableColumns restricts which columns participate (precedence)', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          maxHeight="400px"
          measure={measure}
          enableGlobalSearch
          searchableColumns={['name']}
        />,
      )
      // "avo" would match city "Avon" but city is excluded, so only Avocado stays.
      await user.type(screen.getByRole('searchbox'), 'avo')
      await waitFor(() => {
        expect(screen.getByText('Avocado')).toBeInTheDocument()
        expect(screen.queryByText('Cherry')).toBeNull()
      })
    })
  })

  it('respects per-column meta.searchable:false', async () => {
    const user = userEvent.setup()
    const cityNotSearchable = textColumn<Row>('city', 'City')
    cityNotSearchable.meta = { ...(cityNotSearchable.meta as TableColumnMeta), searchable: false }
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={[textColumn<Row>('name', 'Name'), cityNotSearchable]}
          getRowId={(r) => r.id}
          maxHeight="400px"
          measure={measure}
          enableGlobalSearch
        />,
      )
      // city "Avon" is excluded via meta, so "avo" only keeps Avocado.
      await user.type(screen.getByRole('searchbox'), 'avo')
      await waitFor(() => {
        expect(screen.getByText('Avocado')).toBeInTheDocument()
        expect(screen.queryByText('Cherry')).toBeNull()
      })
    })
  })

  it('record count reflects the searched set', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const { container } = render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          maxHeight="400px"
          measure={measure}
          enableGlobalSearch
          enableRecordCount
        />,
      )
      expect(container.querySelector('[data-tgx-record-count]')).toHaveTextContent('3')
      await user.type(screen.getByRole('searchbox'), 'banana')
      await waitFor(() =>
        expect(container.querySelector('[data-tgx-record-count]')).toHaveTextContent('1'),
      )
    })
  })
})

describe('global search — shared tabbed mode', () => {
  it('renders the search in the tab strip and filters the active tab', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <TabbedTable<Row>
          data={data}
          getRowId={(r) => r.id}
          enableGlobalSearch
          tabs={[
            { id: 'a', label: 'All', columns },
            { id: 'b', label: 'Names', columns: [textColumn<Row>('name', 'Name')] },
          ]}
        />,
      )
      await user.type(screen.getByRole('searchbox'), 'banana')
      await waitFor(() => {
        expect(screen.getByText('Banana')).toBeInTheDocument()
        expect(screen.queryByText('Avocado')).toBeNull()
      })
    })
  })
})
