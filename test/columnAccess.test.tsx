import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { EditableTable } from '../src/components/EditableTable'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { TabbedTable } from '../src/components/TabbedTable'
import { textColumn } from '../src/lib/columns'
import type { ColumnAccessMap, MeasureTextFn, TabbedTableTab } from '../src/types'

type Row = { id: string; a: string; b: string; c: string; d: string }

const measure: MeasureTextFn = (text) => text.length * 8

const data: Row[] = [{ id: '1', a: 'A1', b: 'B1', c: 'C1', d: 'D1' }]

// jsdom reports zero-sized elements, so the virtualizer renders no rows
// without this. Mirrors the existing helper used across this suite (e.g.
// test/columnJump.test.tsx, test/editRenderIsolation.test.tsx).
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

/** The pinned (frozen) pane of the given row. */
function pinnedPane(rowId: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-tgx-row="${rowId}"]`)
  if (!row) throw new Error(`row ${rowId} not rendered`)
  const pane = row.querySelector<HTMLElement>('[data-tgx-pinned]')
  if (!pane) throw new Error('no pinned pane rendered')
  return pane
}

function cellOf(rowId: string, columnId: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-tgx-row="${rowId}"]`)
  if (!row) throw new Error(`row ${rowId} not rendered`)
  const cell = row.querySelector<HTMLElement>(`[data-tgx-cell="${columnId}"]`)
  if (!cell) throw new Error(`no ${columnId} cell rendered`)
  return cell
}

describe('columnAccess (opt-in column governance)', () => {
  it('omitted: no filtering, editability behaves exactly as without this feature', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const columns = [
        textColumn<Row>('a', 'A'),
        textColumn<Row>('b', 'B', { editable: true }),
        textColumn<Row>('c', 'C'),
      ]
      render(
        <EditableTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          editableColumnIds={['b']}
          onSaveEdit={async () => true}
          measure={measure}
        />,
      )
      expect(screen.getByRole('button', { name: /^A/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^B/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^C/ })).toBeInTheDocument()

      await user.dblClick(cellOf('1', 'b'))
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      await user.keyboard('{Escape}')

      await user.dblClick(cellOf('1', 'a'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  it('visible: false removes the column entirely — header, body, visibility picker, column-jump', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const columns = [textColumn<Row>('a', 'A'), textColumn<Row>('b', 'B'), textColumn<Row>('c', 'C')]
      const columnAccess: ColumnAccessMap = { a: { visible: false } }
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          columnAccess={columnAccess}
          measure={measure}
          enableColumnVisibility
          enableColumnJump
        />,
      )
      expect(screen.queryByRole('button', { name: /^A/ })).not.toBeInTheDocument()
      expect(screen.queryByText('A1')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^B/ })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Columns/ }))
      expect(screen.queryByRole('menuitemcheckbox', { name: 'A' })).not.toBeInTheDocument()
      expect(screen.getByRole('menuitemcheckbox', { name: 'B' })).toBeInTheDocument()
      await user.keyboard('{Escape}')

      await user.click(screen.getByRole('button', { name: /^B/ }))
      await user.keyboard('{Control>}g{/Control}')
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByText('A')).not.toBeInTheDocument()
      expect(within(dialog).getByText('B')).toBeInTheDocument()
    })
  })

  it('a column present in the map without visible:false renders normally', async () => {
    await withElementSize(async () => {
      const columns = [textColumn<Row>('a', 'A'), textColumn<Row>('b', 'B', { editable: true })]
      const columnAccess: ColumnAccessMap = { b: { editable: true } }
      render(
        <EditableTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          editableColumnIds={[]}
          onSaveEdit={async () => true}
          columnAccess={columnAccess}
          measure={measure}
        />,
      )
      expect(screen.getByRole('button', { name: /^A/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^B/ })).toBeInTheDocument()
    })
  })

  it('editable: false blocks edit mode even with meta.editable and editableColumnIds set', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const columns = [textColumn<Row>('b', 'B', { editable: true })]
      const columnAccess: ColumnAccessMap = { b: { editable: false } }
      render(
        <EditableTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          editableColumnIds={['b']}
          onSaveEdit={async () => true}
          columnAccess={columnAccess}
          measure={measure}
        />,
      )
      await user.dblClick(cellOf('1', 'b'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  it('editable: true grants edit mode even absent from editableColumnIds and without meta.editable', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      // 'a' has no meta.editable at all, and is not in editableColumnIds —
      // the override must grant edit mode on governance alone.
      const columns = [textColumn<Row>('a', 'A')]
      const columnAccess: ColumnAccessMap = { a: { editable: true } }
      render(
        <EditableTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          editableColumnIds={[]}
          onSaveEdit={async () => true}
          columnAccess={columnAccess}
          measure={measure}
        />,
      )
      await user.dblClick(cellOf('1', 'a'))
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })

  it('a column absent from the map falls back to static config, unaffected by governance elsewhere', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const columns = [
        textColumn<Row>('a', 'A', { editable: true }),
        textColumn<Row>('b', 'B', { editable: true }),
        textColumn<Row>('c', 'C', { editable: true }),
      ]
      // Only 'b' is governed; 'a' (statically allow-listed) and 'c'
      // (statically not allow-listed) must both behave exactly as they
      // would with no columnAccess prop at all.
      const columnAccess: ColumnAccessMap = { b: { editable: true } }
      render(
        <EditableTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          editableColumnIds={['a']}
          onSaveEdit={async () => true}
          columnAccess={columnAccess}
          measure={measure}
        />,
      )
      await user.dblClick(cellOf('1', 'a'))
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      await user.keyboard('{Escape}')

      await user.dblClick(cellOf('1', 'b'))
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      await user.keyboard('{Escape}')

      await user.dblClick(cellOf('1', 'c'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  it('TabbedTable: each tab applies only its own columnAccess', async () => {
    await withElementSize(async () => {
      const tabs: TabbedTableTab<Row>[] = [
        {
          id: 't1',
          label: 'Tab 1',
          columns: [textColumn<Row>('a', 'A'), textColumn<Row>('b', 'B')],
          columnAccess: { a: { visible: false } },
        },
        {
          id: 't2',
          label: 'Tab 2',
          columns: [textColumn<Row>('a', 'A'), textColumn<Row>('b', 'B')],
          columnAccess: { b: { visible: false } },
        },
      ]
      const { unmount } = render(
        <TabbedTable<Row>
          data={data}
          getRowId={(r) => r.id}
          idColumn="id"
          tabs={tabs}
          defaultTabId="t1"
          measure={measure}
        />,
      )
      expect(screen.queryByRole('button', { name: /^A/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^B/ })).toBeInTheDocument()
      unmount()

      render(
        <TabbedTable<Row>
          data={data}
          getRowId={(r) => r.id}
          idColumn="id"
          tabs={tabs}
          defaultTabId="t2"
          measure={measure}
        />,
      )
      expect(screen.getByRole('button', { name: /^A/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^B/ })).not.toBeInTheDocument()
    })
  })

  it('frozenColumns math stays correct when a governed-hidden column sits in the middle of the frozen prefix', async () => {
    await withElementSize(async () => {
      const columns = [
        textColumn<Row>('a', 'A'),
        textColumn<Row>('b', 'B'),
        textColumn<Row>('c', 'C'),
        textColumn<Row>('d', 'D'),
      ]
      // 'b' would have been the second of the first two (frozenColumns=2)
      // columns; once removed, 'c' should take its place in the frozen
      // pane — not leave the pane with only one column.
      const columnAccess: ColumnAccessMap = { b: { visible: false } }
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          columnAccess={columnAccess}
          frozenColumns={2}
          measure={measure}
        />,
      )
      expect(within(pinnedPane('1')).getByText('A1')).toBeInTheDocument()
      expect(within(pinnedPane('1')).getByText('C1')).toBeInTheDocument()
      expect(within(pinnedPane('1')).queryByText('B1')).not.toBeInTheDocument()
      expect(within(pinnedPane('1')).queryByText('D1')).not.toBeInTheDocument()
    })
  })
})
