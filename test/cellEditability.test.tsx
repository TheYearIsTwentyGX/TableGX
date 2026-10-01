import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EditableTable } from '../src/components/EditableTable'
import { textColumn } from '../src/lib/columns'
import type { ColumnAccessMap, MeasureTextFn } from '../src/types'

type Row = { id: string; a: string; b: string; c: string }

const measure: MeasureTextFn = (text) => text.length * 8

const data: Row[] = [
  { id: '1', a: 'A1', b: 'B1', c: 'C1' },
  { id: '2', a: 'A2', b: 'B2', c: 'C2' },
]

// jsdom reports zero-sized elements, so the virtualizer renders no rows without
// this. Mirrors the helper used across this suite (test/columnAccess.test.tsx).
async function withElementSize(fn: () => Promise<void> | void) {
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
  HTMLElement.prototype.scrollTo = () => {}
  try {
    await fn()
  } finally {
    for (const k of Object.keys(sizeProps)) {
      const orig = originals[k]
      if (orig) Object.defineProperty(HTMLElement.prototype, k, orig)
      else Reflect.deleteProperty(HTMLElement.prototype, k)
    }
    HTMLElement.prototype.scrollTo = originalScrollTo
  }
}

function cellOf(rowId: string, columnId: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-tgx-row="${rowId}"]`)
  if (!row) throw new Error(`row ${rowId} not rendered`)
  const cell = row.querySelector<HTMLElement>(`[data-tgx-cell="${columnId}"]`)
  if (!cell) throw new Error(`no ${columnId} cell rendered`)
  return cell
}

const editableCols = [
  textColumn<Row>('a', 'A', { editable: true }),
  textColumn<Row>('b', 'B', { editable: true }),
  textColumn<Row>('c', 'C', { editable: true }),
]

describe('isCellEditable — per-cell veto', () => {
  it('omitted: every cell of an editable column still edits', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <EditableTable<Row>
          data={data}
          columns={editableCols}
          getRowId={(r) => r.id}
          editableColumnIds={['a', 'b', 'c']}
          onSaveEdit={async () => true}
          measure={measure}
        />,
      )
      await user.dblClick(cellOf('1', 'b'))
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })

  it('blocks edit on the vetoed cell only, leaving its column neighbours editable', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <EditableTable<Row>
          data={data}
          columns={editableCols}
          getRowId={(r) => r.id}
          editableColumnIds={['a', 'b', 'c']}
          onSaveEdit={async () => true}
          // Row 1's B is read-only; row 2's B is not. A column-level control
          // could not express this, which is the whole point.
          isCellEditable={(row, columnId) => !(row.id === '1' && columnId === 'b')}
          measure={measure}
        />,
      )
      await user.dblClick(cellOf('1', 'b'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

      await user.dblClick(cellOf('2', 'b'))
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })

  it('withholds the edit affordance on a vetoed cell', async () => {
    await withElementSize(async () => {
      render(
        <EditableTable<Row>
          data={data}
          columns={editableCols}
          getRowId={(r) => r.id}
          editableColumnIds={['a', 'b', 'c']}
          onSaveEdit={async () => true}
          isCellEditable={(row, columnId) => !(row.id === '1' && columnId === 'b')}
          measure={measure}
        />,
      )
      // The pencil hint must not advertise an editor the cell will refuse.
      expect(cellOf('1', 'b').querySelector('svg.lucide-pencil')).toBeNull()
      expect(cellOf('1', 'a').querySelector('svg.lucide-pencil')).not.toBeNull()
    })
  })

  it('Tab skips over a vetoed cell instead of landing in it', async () => {
    const user = userEvent.setup()
    const onSaveEdit = vi.fn(async () => true)
    await withElementSize(async () => {
      render(
        <EditableTable<Row>
          data={data}
          columns={editableCols}
          getRowId={(r) => r.id}
          editableColumnIds={['a', 'b', 'c']}
          onSaveEdit={onSaveEdit}
          isCellEditable={(_row, columnId) => columnId !== 'b'}
          measure={measure}
        />,
      )
      await user.dblClick(cellOf('1', 'a'))
      expect(screen.getByRole('textbox')).toBeInTheDocument()

      // Commit A and Tab forward. B is vetoed, so the editor must open on C.
      await user.keyboard('changed{Tab}')
      // The editor seeds with the existing value, so typing appends to it.
      expect(onSaveEdit).toHaveBeenCalledWith(data[0], 'a', 'A1changed')

      const editor = await screen.findByRole('textbox')
      // The editor now sits in C's cell, not B's.
      expect(cellOf('1', 'c').contains(editor)).toBe(true)
      expect(cellOf('1', 'b').contains(editor)).toBe(false)
    })
  })

  it('cannot grant edit rights that columnAccess withheld', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const columnAccess: ColumnAccessMap = { b: { editable: false } }
      render(
        <EditableTable<Row>
          data={data}
          columns={editableCols}
          getRowId={(r) => r.id}
          editableColumnIds={['a', 'b', 'c']}
          onSaveEdit={async () => true}
          columnAccess={columnAccess}
          // Enthusiastically permissive — governance must still win.
          isCellEditable={() => true}
          measure={measure}
        />,
      )
      await user.dblClick(cellOf('1', 'b'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  it('cannot grant edit rights to a column missing from editableColumnIds', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <EditableTable<Row>
          data={data}
          columns={editableCols}
          getRowId={(r) => r.id}
          editableColumnIds={['a']}
          onSaveEdit={async () => true}
          isCellEditable={() => true}
          measure={measure}
        />,
      )
      await user.dblClick(cellOf('1', 'c'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })
})

describe('meta.getEditValue — display and edit value differ', () => {
  it('seeds the editor from getEditValue rather than the raw row value', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const columns = [
        textColumn<Row>('a', 'A', {
          editable: true,
          // Cell displays a formatted amount; the editor opens on the literal.
          renderCell: (ctx) => `$${String(ctx.row.a)}.00`,
          getEditValue: (row) => `raw:${String(row.a)}`,
        }),
      ]
      render(
        <EditableTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          editableColumnIds={['a']}
          onSaveEdit={async () => true}
          measure={measure}
        />,
      )
      await user.dblClick(cellOf('1', 'a'))
      expect(screen.getByRole('textbox')).toHaveValue('raw:A1')
    })
  })

  it('compares against getEditValue when deciding a value is unchanged', async () => {
    const user = userEvent.setup()
    const onSaveEdit = vi.fn(async () => true)
    await withElementSize(async () => {
      const columns = [
        textColumn<Row>('a', 'A', {
          editable: true,
          getEditValue: (row) => `raw:${String(row.a)}`,
        }),
      ]
      render(
        <EditableTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          editableColumnIds={['a']}
          onSaveEdit={onSaveEdit}
          measure={measure}
        />,
      )
      await user.dblClick(cellOf('1', 'a'))
      // Commit the seeded value untouched: that is a no-op, not a save.
      await user.keyboard('{Enter}')
      expect(onSaveEdit).not.toHaveBeenCalled()
    })
  })
})

describe('meta.getCellInputType — per-cell editor kind', () => {
  it('overrides the column inputType for the rows it answers for', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const columns = [
        textColumn<Row>('a', 'A', {
          editable: true,
          inputType: 'text',
          getCellInputType: (row) => (row.id === '1' ? 'number' : undefined),
        }),
      ]
      render(
        <EditableTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          editableColumnIds={['a']}
          onSaveEdit={async () => true}
          measure={measure}
        />,
      )
      await user.dblClick(cellOf('1', 'a'))
      expect(screen.getByRole('spinbutton')).toBeInTheDocument()
      await user.keyboard('{Escape}')

      // Row 2 returns undefined, so it falls back to the column's 'text'.
      await user.dblClick(cellOf('2', 'a'))
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })
})
