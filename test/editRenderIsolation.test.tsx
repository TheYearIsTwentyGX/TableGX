import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TableGX } from '../src/components/TableGX'
import { customColumn, textColumn } from '../src/lib/columns'
import type { MeasureTextFn } from '../src/types'

type Row = { id: string; name: string; city: string }

const measure: MeasureTextFn = (text) => text.length * 8

const data: Row[] = [
  { id: '1', name: 'Ada', city: 'London' },
  { id: '2', name: 'Linus', city: 'Helsinki' },
  { id: '3', name: 'Grace', city: 'Arlington' },
  { id: '4', name: 'Alan', city: 'Wilmslow' },
]

// Per-row render tally for the city cell: bumps only when that row's cells
// actually re-render (memo-bailed rows never invoke their cell renderers).
const cityRenders = new Map<string, number>()

const columns = [
  textColumn<Row>('name', 'Name', { editable: true }),
  customColumn<Row>('city', 'City', (ctx) => {
    cityRenders.set(ctx.row.id, (cityRenders.get(ctx.row.id) ?? 0) + 1)
    return ctx.row.city
  }),
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

function nameCellOfRow(rowId: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-tgx-row="${rowId}"]`)
  if (!row) throw new Error(`row ${rowId} not rendered`)
  const cell = row.querySelector<HTMLElement>('[data-tgx-cell="name"]')
  if (!cell) throw new Error('no name cell rendered')
  return cell
}

describe('edit commit render isolation', () => {
  it('committing an edit does not re-render other rows', async () => {
    const user = userEvent.setup()
    const onSaveEdit = vi.fn(async () => true)
    cityRenders.clear()

    await withElementSize(async () => {
      render(
        <TableGX<Row>
          variant="table"
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
          editable
          editableColumnIds={['name']}
          onSaveEdit={onSaveEdit}
        />,
      )
      expect(screen.getByText('Helsinki')).toBeInTheDocument()

      // Open the editor on row 1, then snapshot the other rows' tallies: the
      // begin-edit re-render must already be absorbed by their memo bailout,
      // and the commit below must not add to them either.
      await user.dblClick(nameCellOfRow('1'))
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      const before = new Map(cityRenders)

      const textbox = screen.getByRole('textbox')
      await user.clear(textbox)
      await user.type(textbox, 'Augusta')
      await user.keyboard('{Enter}')
      await waitFor(() => expect(onSaveEdit).toHaveBeenCalledOnce())
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())

      for (const rowId of ['2', '3', '4']) {
        expect(cityRenders.get(rowId), `row ${rowId} re-rendered during commit`).toBe(
          before.get(rowId),
        )
      }
    })
  })
})
