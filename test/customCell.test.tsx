import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditableTable } from '../src/components/EditableTable'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { CellOverflowList } from '../src/core/CellOverflowList'
import { customColumn, textColumn } from '../src/lib/columns'
import type { CellRenderContext, MeasureTextFn } from '../src/types'

type Row = { id: string; name: string; tags: string | string[] }

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

function withElementSize(): () => void {
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
  return () => {
    for (const k of Object.keys(sizeProps)) {
      const orig = originals[k]
      if (orig) Object.defineProperty(HTMLElement.prototype, k, orig)
      else Reflect.deleteProperty(HTMLElement.prototype, k)
    }
  }
}

const noopSave = async () => true

describe('custom cell rendering (disableTruncate / customColumn)', () => {
  let restore: () => void
  beforeEach(() => {
    restore = withElementSize()
  })
  afterEach(() => restore())

  it('renders multi-element custom content unclipped (no truncate wrapper)', async () => {
    const columns = [
      textColumn<Row>('name', 'Name'),
      customColumn<Row>(
        'tags',
        'Tags',
        (ctx) => (
          <>
            {(ctx.row.tags as string[]).map((t) => (
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
      customColumn<Row>(
        'name',
        'Name',
        (ctx) => <span data-testid="custom-name">{ctx.row.name}</span>,
        {
          editable: true,
        },
      ),
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

  it('renders custom content side by side without truncation', async () => {
    const columns = [
      textColumn<Row>('name', 'Name'),
      customColumn<Row>('tags', 'Tags', ({ row }) => (
        <>
          <span data-testid="chip-a">{`A:${row.tags}`}</span>
          <span data-testid="chip-b">{`B:${row.tags}`}</span>
        </>
      )),
    ]
    render(
      <ReadOnlyTable<Row>
        data={[{ id: '1', name: 'Alpha', tags: 'x' }]}
        columns={columns}
        getRowId={(r) => r.id}
        measure={measure}
      />,
    )

    // Both inline elements render (side by side), not a single clipped value.
    const a = await screen.findByTestId('chip-a')
    const b = await screen.findByTestId('chip-b')
    expect(a).toBeInTheDocument()
    expect(b).toBeInTheDocument()

    // The wrapping container is flexible and does NOT apply truncate.
    const wrapper = a.parentElement!
    expect(wrapper.className).toContain('flex')
    expect(wrapper.className).not.toContain('truncate')
  })

  it('takes precedence over the column TanStack cell content', async () => {
    const columns = [
      customColumn<Row>('name', 'Name', () => <span>CUSTOM</span>, {
        // Even with an accessor, custom render wins over the default text cell.
      }),
    ]
    render(
      <ReadOnlyTable<Row>
        data={[{ id: '1', name: 'Alpha', tags: 'x' }]}
        columns={columns}
        getRowId={(r) => r.id}
        measure={measure}
      />,
    )
    expect(await screen.findByText('CUSTOM')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
  })
})

describe('cell actions', () => {
  let restore: () => void
  beforeEach(() => {
    restore = withElementSize()
  })
  afterEach(() => restore())

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

describe('cell click handler (meta.onCellClick)', () => {
  let restore: () => void
  beforeEach(() => {
    restore = withElementSize()
  })
  afterEach(() => restore())

  it('fires with a typed context and is isolated from ancestors', async () => {
    const user = userEvent.setup()
    const onCellClick = vi.fn()
    const onParentClick = vi.fn()
    const columns = [
      textColumn<Row>('name', 'Name'),
      customColumn<Row>('tags', 'Tags', ({ row }) => <span>tag:{row.tags}</span>, {
        onCellClick: (ctx: CellRenderContext, event) => onCellClick(ctx, event),
      }),
    ]
    render(
      <div onClick={onParentClick}>
        <ReadOnlyTable<Row>
          data={[{ id: '1', name: 'Alpha', tags: 'x' }]}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
        />
      </div>,
    )

    await user.click(await screen.findByText('tag:x'))

    expect(onCellClick).toHaveBeenCalledTimes(1)
    const ctx = onCellClick.mock.calls[0]![0] as CellRenderContext
    expect(ctx.columnId).toBe('tags')
    expect(ctx.row).toEqual({ id: '1', name: 'Alpha', tags: 'x' })
    expect(ctx.isEditing).toBe(false)
    // stopPropagation isolates the click from row/ancestor handlers.
    expect(onParentClick).not.toHaveBeenCalled()
  })
})

describe('edit vs. custom click precedence (EditableTable)', () => {
  let restore: () => void
  beforeEach(() => {
    restore = withElementSize()
  })
  afterEach(() => restore())

  const baseProps = {
    data: [{ id: '1', name: 'Alpha', tags: 'x' } as Row],
    getRowId: (r: Row) => r.id,
    measure,
    singleClickEdit: true,
    onSaveEdit: async () => true,
  }

  it('enters edit mode on click for a plain editable column', async () => {
    const user = userEvent.setup()
    const columns = [textColumn<Row>('name', 'Name', { editable: true })]
    render(
      <EditableTable<Row>
        {...baseProps}
        columns={columns}
        editableColumnIds={['name']}
      />,
    )
    await user.click(await screen.findByText('Alpha'))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('does NOT enter edit mode when the column opts into onCellClick', async () => {
    const user = userEvent.setup()
    const onCellClick = vi.fn()
    const columns = [
      customColumn<Row>('name', 'Name', ({ row }) => <span>{row.name}</span>, {
        editable: true,
        onCellClick: () => onCellClick(),
      }),
    ]
    render(
      <EditableTable<Row>
        {...baseProps}
        columns={columns}
        editableColumnIds={['name']}
      />,
    )
    await user.click(await screen.findByText('Alpha'))
    expect(onCellClick).toHaveBeenCalledTimes(1)
    // No editor opened — custom click suppresses auto inline-edit entry.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('CellOverflowList', () => {
  // Each measured item span gets a width from its text length; the container
  // exposes a controllable available width; ResizeObserver callbacks are
  // captured so a resize can be simulated.
  let observerCallbacks: Array<() => void>
  let rectSpy: ReturnType<typeof vi.spyOn>
  let clientWidthDescriptor: PropertyDescriptor | undefined
  let availableWidth = 1000

  beforeEach(() => {
    observerCallbacks = []
    availableWidth = 1000

    class RO {
      cb: () => void
      constructor(cb: () => void) {
        this.cb = cb
        observerCallbacks.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', RO)

    clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        // Only the flex container (no data-measure marker) reports the budget.
        return (this as HTMLElement).hasAttribute('data-measure') ? 0 : availableWidth
      },
    })

    // Measured item width = 100px per item, indicator = 30px, derived from text.
    rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const text = this.textContent ?? ''
        const isIndicator = /^\+\d+$/.test(text.trim())
        const width = isIndicator ? 30 : 100
        return { width, height: 20, top: 0, left: 0, right: width, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      },
    )
  })

  afterEach(() => {
    rectSpy.mockRestore()
    if (clientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor)
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
    }
    vi.unstubAllGlobals()
  })

  function triggerResize() {
    for (const cb of observerCallbacks) cb()
  }

  // The hidden measurement layer always renders every item + an indicator, so
  // assertions must look only at the visible (non aria-hidden) region.
  function visible(re: RegExp): HTMLElement[] {
    return screen.queryAllByText(re).filter((el) => !el.closest('[aria-hidden="true"]'))
  }

  it('shows all items when they fit', () => {
    availableWidth = 1000 // 3 * 100 + gaps fit easily
    render(
      <CellOverflowList>
        <span>one</span>
        <span>two</span>
        <span>three</span>
      </CellOverflowList>,
    )
    expect(visible(/^(one|two|three)$/)).toHaveLength(3)
    expect(visible(/^\+\d+$/)).toHaveLength(0)
  })

  it('collapses overflowing items into a "+N" indicator', () => {
    // budget = 250 - 30 (indicator) - 8 (gap) = 212 → fits 100 and 100+8+100=208 → 2 items.
    availableWidth = 250
    render(
      <CellOverflowList>
        <span>a</span>
        <span>b</span>
        <span>c</span>
        <span>d</span>
      </CellOverflowList>,
    )
    const indicator = visible(/^\+\d+$/)
    expect(indicator).toHaveLength(1)
    expect(indicator[0]).toHaveTextContent('+2')
  })

  it('re-measures and reveals more items when the column grows', () => {
    availableWidth = 250
    render(
      <CellOverflowList>
        <span>a</span>
        <span>b</span>
        <span>c</span>
        <span>d</span>
      </CellOverflowList>,
    )
    expect(visible(/^\+\d+$/)).toHaveLength(1)

    // Grow the column so everything fits, then fire the ResizeObserver.
    availableWidth = 1000
    act(() => triggerResize())
    expect(visible(/^\+\d+$/)).toHaveLength(0)
  })

  it('uses a custom overflow indicator', () => {
    availableWidth = 150
    render(
      <CellOverflowList renderOverflow={(n) => <span>more {n}</span>}>
        <span>a</span>
        <span>b</span>
        <span>c</span>
      </CellOverflowList>,
    )
    const indicator = visible(/^more \d+$/)
    expect(indicator.length).toBe(1)
  })
})

