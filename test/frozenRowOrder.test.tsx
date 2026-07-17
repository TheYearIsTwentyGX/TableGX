import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { EditableTable } from '../src/components/EditableTable'
import { numberColumn, textColumn } from '../src/lib/columns'
import type { MeasureTextFn, SaveEditFn } from '../src/types'

type Row = { id: string; name: string; amount: number }

const measure: MeasureTextFn = (text) => text.length * 8

const baseData: Row[] = [
  { id: '1', name: 'Alpha', amount: 10 },
  { id: '2', name: 'Bravo', amount: 20 },
  { id: '3', name: 'Charlie', amount: 30 },
]

const editableColumns = [
  textColumn<Row>('name', 'Name'),
  numberColumn<Row>('amount', 'Amount', { editable: true }),
]

// jsdom reports zero-sized elements, so the virtualizer renders nothing, and
// has no scrollTo/scrollIntoView implementations. Give elements a size and
// stub both for the duration of `fn` (mirrors the existing helper used across
// this suite, e.g. test/columnJump.test.tsx).
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
  const originalScrollTo = HTMLElement.prototype.scrollTo
  // setup.ts already stubs HTMLElement.prototype.scrollIntoView with a no-op
  // (shadowing anything set on Element.prototype) — override that same own
  // property so the mock is actually reached.
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
  HTMLElement.prototype.scrollTo = vi.fn()
  HTMLElement.prototype.scrollIntoView = vi.fn()
  try {
    await fn()
  } finally {
    for (const k of Object.keys(sizeProps)) {
      const orig = originals[k]
      if (orig) Object.defineProperty(HTMLElement.prototype, k, orig)
      else Reflect.deleteProperty(HTMLElement.prototype, k)
    }
    HTMLElement.prototype.scrollTo = originalScrollTo
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView
  }
}

function rowOrder(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-tgx-row]')).map(
    (el) => el.getAttribute('data-tgx-row') ?? '',
  )
}

function amountCellOfRow(rowId: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-tgx-row="${rowId}"]`)
  if (!row) throw new Error(`row ${rowId} not rendered`)
  const cell = row.querySelector<HTMLElement>('[data-tgx-cell="amount"]')
  if (!cell) throw new Error('no amount cell rendered')
  return cell
}

function Harness({
  initialData,
  initialSorting,
  onData,
}: {
  initialData: Row[]
  initialSorting?: { id: string; desc: boolean }[]
  onData?: (setData: (fn: (prev: Row[]) => Row[]) => void) => void
}) {
  const [data, setData] = useState(initialData)
  onData?.(setData)
  const onSaveEdit: SaveEditFn<Row> = async (row, columnId, value) => {
    setData((prev) => prev.map((r) => (r.id === row.id ? { ...r, [columnId]: value } : r)))
    return true
  }
  return (
    <EditableTable<Row>
      data={data}
      columns={editableColumns}
      getRowId={(r) => r.id}
      measure={measure}
      editableColumnIds={['amount']}
      initialSorting={initialSorting}
      onSaveEdit={onSaveEdit}
      enableRowVirtualization={false}
    />
  )
}

describe('frozen row order', () => {
  it('does not resort when an edit changes the sorted column value', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(<Harness initialData={baseData} initialSorting={[{ id: 'amount', desc: false }]} />)
      expect(rowOrder()).toEqual(['1', '2', '3'])

      // Edit row 1 (amount 10, currently first) to 999 — under a live resort
      // it would jump to last; frozen order must keep it first.
      await user.dblClick(amountCellOfRow('1'))
      const input = screen.getByRole('spinbutton')
      await user.clear(input)
      await user.type(input, '999')
      await user.keyboard('{Enter}')
      await waitFor(() => expect(screen.queryByRole('spinbutton')).toBeNull())

      expect(rowOrder()).toEqual(['1', '2', '3'])
      expect(screen.getByText('999')).toBeInTheDocument()
    })
  })

  it('still resorts when the user changes the sort criteria', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const { container } = render(<Harness initialData={baseData} />)
      expect(rowOrder()).toEqual(['1', '2', '3'])

      const header = container.querySelector<HTMLElement>('[data-tgx-header="amount"]')
      if (!header) throw new Error('no header rendered')
      // Numeric columns auto-sort descending-first (TanStack's getAutoSortDir),
      // so a single click on a previously-unsorted numeric column lands here.
      await user.click(header)
      await waitFor(() => expect(header).toHaveAttribute('aria-sort', 'descending'))

      expect(rowOrder()).toEqual(['3', '2', '1'])
    })
  })

  it('inserts a new row at its sorted position without moving existing rows', async () => {
    let setData: ((fn: (prev: Row[]) => Row[]) => void) | undefined
    await withElementSize(async () => {
      render(
        <Harness
          initialData={baseData}
          initialSorting={[{ id: 'amount', desc: false }]}
          onData={(fn) => {
            setData = fn
          }}
        />,
      )
      expect(rowOrder()).toEqual(['1', '2', '3'])

      // amount 25 belongs between row 2 (20) and row 3 (30).
      setData!((prev) => [...prev, { id: '4', name: 'Delta', amount: 25 }])
      await waitFor(() => expect(rowOrder()).toContain('4'))

      expect(rowOrder()).toEqual(['1', '2', '4', '3'])
    })
  })

  it('inserts multiple new rows together, in correct relative order', async () => {
    let setData: ((fn: (prev: Row[]) => Row[]) => void) | undefined
    await withElementSize(async () => {
      render(
        <Harness
          initialData={baseData}
          initialSorting={[{ id: 'amount', desc: false }]}
          onData={(fn) => {
            setData = fn
          }}
        />,
      )
      expect(rowOrder()).toEqual(['1', '2', '3'])

      setData!((prev) => [
        ...prev,
        { id: '5', name: 'Echo', amount: 26 },
        { id: '4', name: 'Delta', amount: 24 },
      ])
      await waitFor(() => expect(rowOrder()).toContain('4'))

      expect(rowOrder()).toEqual(['1', '2', '4', '5', '3'])
    })
  })

  it('drops a removed row and keeps the survivors in their existing order', async () => {
    let setData: ((fn: (prev: Row[]) => Row[]) => void) | undefined
    await withElementSize(async () => {
      render(
        <Harness
          initialData={baseData}
          initialSorting={[{ id: 'amount', desc: false }]}
          onData={(fn) => {
            setData = fn
          }}
        />,
      )
      expect(rowOrder()).toEqual(['1', '2', '3'])

      setData!((prev) => prev.filter((r) => r.id !== '2'))
      await waitFor(() => expect(rowOrder()).toEqual(['1', '3']))
    })
  })

  it('appends new rows wherever the data puts them when no sort is active', async () => {
    let setData: ((fn: (prev: Row[]) => Row[]) => void) | undefined
    await withElementSize(async () => {
      render(
        <Harness
          initialData={baseData}
          onData={(fn) => {
            setData = fn
          }}
        />,
      )
      expect(rowOrder()).toEqual(['1', '2', '3'])

      setData!((prev) => [{ id: '4', name: 'Delta', amount: 1 }, ...prev])
      await waitFor(() => expect(rowOrder()).toContain('4'))

      expect(rowOrder()).toEqual(['4', '1', '2', '3'])
    })
  })

  it('scrolls to and highlights a newly inserted row', async () => {
    let setData: ((fn: (prev: Row[]) => Row[]) => void) | undefined
    await withElementSize(async () => {
      render(
        <Harness
          initialData={baseData}
          initialSorting={[{ id: 'amount', desc: false }]}
          onData={(fn) => {
            setData = fn
          }}
        />,
      )

      setData!((prev) => [...prev, { id: '4', name: 'Delta', amount: 25 }])
      await waitFor(() => expect(rowOrder()).toContain('4'))

      const newRow = document.querySelector('[data-tgx-row="4"]')
      expect(newRow).toHaveAttribute('data-tgx-just-added', '')
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()

      await waitFor(
        () => expect(newRow).not.toHaveAttribute('data-tgx-just-added'),
        { timeout: 2000 },
      )
    })
  })
})
