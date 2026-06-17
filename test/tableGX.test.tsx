import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TableGX } from '../src/components/TableGX'
import { independentTable } from '../src/components/IndependentTabbedTable'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn, TabbedTableTab } from '../src/types'

type Row = { id: string; name: string; city: string }

const measure: MeasureTextFn = (text) => text.length * 8

const data: Row[] = [
  { id: '1', name: 'Ada', city: 'London' },
  { id: '2', name: 'Linus', city: 'Helsinki' },
]

const columns = [textColumn<Row>('name', 'Name'), textColumn<Row>('city', 'City')]
const editableColumns = [
  textColumn<Row>('name', 'Name', { editable: true }),
  textColumn<Row>('city', 'City'),
]

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

function firstNameCell(): HTMLElement {
  const row = document.querySelector<HTMLElement>('[data-tgx-row]')
  if (!row) throw new Error('no body row rendered')
  const cell = row.querySelector<HTMLElement>('[data-tgx-cell="name"]')
  if (!cell) throw new Error('no name cell rendered')
  return cell
}

describe('TableGX (variant facade)', () => {
  it('variant="table" renders a single read-only table', async () => {
    await withElementSize(async () => {
      render(
        <TableGX<Row>
          variant="table"
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
        />,
      )
      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Ada')).toBeInTheDocument()
      // Read-only by default: double-clicking a cell opens no editor.
      await userEvent.dblClick(firstNameCell())
      expect(screen.queryByRole('textbox')).toBeNull()
    })
  })

  it('variant="tabbed" renders shared-dataset tabs through the primitives', () => {
    const tabs: TabbedTableTab<Row>[] = [
      { id: 'all', label: 'All', columns },
      { id: 'cities', label: 'Cities', columns: [textColumn<Row>('city', 'City')] },
    ]
    render(
      <TableGX<Row>
        variant="tabbed"
        data={data}
        getRowId={(r) => r.id}
        idColumn="name"
        tabs={tabs}
        measure={measure}
      />,
    )
    // Both tab buttons render inside the shared tab strip.
    const strip = document.querySelector<HTMLElement>('[data-tgx-tab-strip]')!
    expect(within(strip).getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(within(strip).getByRole('button', { name: 'Cities' })).toBeInTheDocument()
  })

  it('variant="independent" renders independent per-tab tables', () => {
    const tabs = [
      independentTable<Row>({
        id: 'people',
        label: 'People',
        data,
        getRowId: (r) => r.id,
        columns,
      }),
      independentTable<{ id: string; total: number }>({
        id: 'totals',
        label: 'Totals',
        data: [{ id: 'x', total: 5 }],
        getRowId: (r) => r.id,
        columns: [textColumn<{ id: string; total: number }>('total', 'Total')],
      }),
    ]
    render(<TableGX variant="independent" tabs={tabs} measure={measure} />)
    const strip = document.querySelector<HTMLElement>('[data-tgx-tab-strip]')!
    expect(within(strip).getByRole('button', { name: 'People' })).toBeInTheDocument()
    expect(within(strip).getByRole('button', { name: 'Totals' })).toBeInTheDocument()
  })

  it('toggles a single table between read-only and editable live, with no stranded editor', async () => {
    const user = userEvent.setup()
    const onSaveEdit = vi.fn(async () => true)

    function Harness() {
      const [editable, setEditable] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setEditable((v) => !v)}>
            toggle
          </button>
          <TableGX<Row>
            variant="table"
            data={data}
            columns={editableColumns}
            getRowId={(r) => r.id}
            measure={measure}
            editable={editable}
            editableColumnIds={['name']}
            onSaveEdit={onSaveEdit}
          />
        </>
      )
    }

    await withElementSize(async () => {
      render(<Harness />)

      // Read-only: double-click opens no editor.
      await user.dblClick(firstNameCell())
      expect(screen.queryByRole('textbox')).toBeNull()

      // Flip to editable (state-driven, no remount), then edit.
      await user.click(screen.getByRole('button', { name: 'toggle' }))
      await user.dblClick(firstNameCell())
      expect(screen.getByRole('textbox')).toBeInTheDocument()

      // Flip back to read-only mid-edit: the editor must be cancelled, not stranded.
      await user.click(screen.getByRole('button', { name: 'toggle' }))
      expect(screen.queryByRole('textbox')).toBeNull()
      // The original value is still shown — nothing was committed by the toggle.
      expect(screen.getByText('Ada')).toBeInTheDocument()
      expect(onSaveEdit).not.toHaveBeenCalled()
    })
  })

  it('warns in development when editable is on but required props are missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      render(
        <TableGX<Row>
          variant="table"
          data={data}
          columns={editableColumns}
          getRowId={(r) => r.id}
          measure={measure}
          editable
        />,
      )
      const messages = warn.mock.calls.map((c) => String(c[0])).join('\n')
      expect(messages).toContain('onSaveEdit')
      expect(messages).toContain('editableColumnIds')
    } finally {
      warn.mockRestore()
    }
  })

  it('exposes the compound primitives as static members', () => {
    expect(typeof TableGX.Provider).toBe('function')
    expect(typeof TableGX.Container).toBe('function')
    expect(typeof TableGX.TabStrip).toBe('function')
    expect(typeof TableGX.Panels).toBe('function')
    expect(typeof TableGX.Body).toBe('function')
    expect(typeof TableGX.Toolbar).toBe('function')
    expect(typeof TableGX.FilterBadges).toBe('function')
    expect(typeof TableGX.SortControl).toBe('function')
    expect(typeof TableGX.ColumnVisibility).toBe('function')
    expect(typeof TableGX.RecordCount).toBe('function')
  })
})
