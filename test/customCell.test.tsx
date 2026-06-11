import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditableTable } from '../src/components/EditableTable'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { customColumn, textColumn } from '../src/lib/columns'
import type { MeasureTextFn } from '../src/types'

type Row = { id: string; name: string; tags: string[] }

const measure: MeasureTextFn = (text) => text.length * 8
const rows: Row[] = [{ id: '1', name: 'Ada', tags: ['x', 'y', 'z'] }]

// jsdom reports zero-sized elements, so the row virtualizer (which reads
// offset/client width/height) renders nothing unless we give elements a size.
const sizeProps = {
  offsetWidth: { configurable: true, get: () => 800 },
  offsetHeight: { configurable: true, get: () => 400 },
  clientWidth: { configurable: true, get: () => 800 },
  clientHeight: { configurable: true, get: () => 400 },
}
let originals: Record<string, PropertyDescriptor | undefined>

beforeEach(() => {
  originals = Object.fromEntries(
    Object.keys(sizeProps).map((k) => [
      k,
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, k) ??
        Object.getOwnPropertyDescriptor(Element.prototype, k),
    ]),
  )
  for (const [k, d] of Object.entries(sizeProps)) {
    Object.defineProperty(HTMLElement.prototype, k, d)
  }
})

afterEach(() => {
  for (const k of Object.keys(sizeProps)) {
    const orig = originals[k]
    if (orig) Object.defineProperty(HTMLElement.prototype, k, orig)
    else Reflect.deleteProperty(HTMLElement.prototype, k)
  }
})

const noopSave = async () => true

describe('custom cell rendering (disableTruncate / customColumn)', () => {
  it('renders multi-element custom content unclipped (no truncate wrapper)', async () => {
    const columns = [
      textColumn<Row>('name', 'Name'),
      customColumn<Row>(
        'tags',
        'Tags',
        (row) => (
          <>
            {row.tags.map((t) => (
              <span key={t} data-testid={`tag-${t}`}>
                {t}
              </span>
            ))}
          </>
        ),
        { measureText: () => 'tags tags' },
      ),
    ]

    render(
      <ReadOnlyTable<Row>
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight="400px"
        measure={measure}
      />,
    )

    // Every badge-like element renders.
    const first = await screen.findByTestId('tag-x')
    expect(first).toBeInTheDocument()
    expect(screen.getByTestId('tag-y')).toBeInTheDocument()
    expect(screen.getByTestId('tag-z')).toBeInTheDocument()

    // The custom value wrapper opts out of single-line truncation.
    const customWrapper = first.parentElement as HTMLElement
    expect(customWrapper).not.toHaveClass('truncate')
    expect(customWrapper).toHaveClass('flex')

    // A normal column still truncates — the opt-out is per column.
    expect(screen.getByText('Ada')).toHaveClass('truncate')
  })

  it('shows the editor (not the custom content) when a custom editable cell enters edit mode', async () => {
    const user = userEvent.setup()
    const columns = [
      customColumn<Row>('name', 'Name', (row) => <span data-testid="custom-name">{row.name}</span>, {
        editable: true,
      }),
    ]

    render(
      <EditableTable<Row>
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        editableColumnIds={['name']}
        onSaveEdit={noopSave}
        singleClickEdit
        maxHeight="400px"
        measure={measure}
      />,
    )

    const custom = await screen.findByTestId('custom-name')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    await user.click(custom)

    // CellEditor wins the render; the custom display content is gone.
    expect(await screen.findByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByTestId('custom-name')).not.toBeInTheDocument()
  })
})

describe('cell actions', () => {
  it('renders a declarative button action and fires its onClick with the row', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const columns = [
      textColumn<Row>('name', 'Name', {
        actions: [{ id: 'del', label: 'Delete', onClick }],
      }),
    ]

    render(
      <ReadOnlyTable<Row>
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight="400px"
        measure={measure}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClick).toHaveBeenCalledWith(rows[0], expect.anything())
  })

  it('renders a custom action control and isolates its click from the editor', async () => {
    const user = userEvent.setup()
    const actionClicked = vi.fn()
    const columns = [
      textColumn<Row>('name', 'Name', {
        editable: true,
        actions: [
          {
            id: 'pop',
            render: (row) => (
              <button type="button" data-testid="pop-trigger" onClick={() => actionClicked(row)}>
                Open
              </button>
            ),
          },
        ],
      }),
    ]

    render(
      <EditableTable<Row>
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        editableColumnIds={['name']}
        onSaveEdit={noopSave}
        singleClickEdit
        maxHeight="400px"
        measure={measure}
      />,
    )

    // Clicking the custom control runs its handler but must NOT open the editor.
    await user.click(await screen.findByTestId('pop-trigger'))
    expect(actionClicked).toHaveBeenCalledTimes(1)
    expect(actionClicked).toHaveBeenCalledWith(rows[0])
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    // The cell still enters edit mode when its value area is clicked.
    await user.click(screen.getByText('Ada'))
    expect(await screen.findByRole('textbox')).toBeInTheDocument()
  })

  it('honors isHidden on a custom action', async () => {
    const columns = [
      textColumn<Row>('name', 'Name', {
        actions: [
          {
            id: 'pop',
            isHidden: () => true,
            render: () => <button type="button" data-testid="pop-trigger" />,
          },
        ],
      }),
    ]

    render(
      <ReadOnlyTable<Row>
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight="400px"
        measure={measure}
      />,
    )

    expect(await screen.findByText('Ada')).toBeInTheDocument()
    expect(screen.queryByTestId('pop-trigger')).not.toBeInTheDocument()
  })
})
