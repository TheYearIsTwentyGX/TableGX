import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EditableTable } from '../src/components/EditableTable'
import { IndependentTabbedTable, independentTable } from '../src/components/IndependentTabbedTable'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { TabbedTable } from '../src/components/TabbedTable'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn, TabbedTableTab } from '../src/types'

type Row = { id: string; name: string; city: string; country: string }

const measure: MeasureTextFn = (text) => text.length * 8

const data: Row[] = [{ id: '1', name: 'Avocado', city: 'Lima', country: 'Peru' }]

const columns = [
  textColumn<Row>('name', 'Name'),
  textColumn<Row>('city', 'City'),
  textColumn<Row>('country', 'Country'),
]

// jsdom has no real layout or scrollTo; give elements a size and a scrollTo
// stub for the duration of `fn`. Mirrors the existing `withElementSize`
// helper already used across this suite (e.g. test/globalSearch.test.tsx).
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
  HTMLElement.prototype.scrollTo = vi.fn()
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

async function openViaShortcut(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Name/ }))
  await user.keyboard('{Control>}g{/Control}')
}

describe('column jump — single table', () => {
  it('does nothing when enableColumnJump is unset', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(<ReadOnlyTable<Row> data={data} columns={columns} getRowId={(r) => r.id} measure={measure} />)
      await openViaShortcut(user)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('opens on Ctrl+G when focus is inside the table', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
          enableColumnJump
        />,
      )
      await openViaShortcut(user)
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })
  })

  it('opens on Ctrl+G after clicking a plain body cell (no natively focusable target)', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
          enableColumnJump
        />,
      )
      // "Avocado" is plain cell text, not a button/input/checkbox — clicking
      // it alone would never move focus into the table without the root
      // container's mousedown-driven focus fallback.
      await user.click(screen.getByText('Avocado'))
      await user.keyboard('{Control>}g{/Control}')
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })
  })

  it('does not open when focus is outside the table', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <>
          <button>Outside</button>
          <ReadOnlyTable<Row>
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            measure={measure}
            enableColumnJump
          />
        </>,
      )
      await user.click(screen.getByRole('button', { name: 'Outside' }))
      await user.keyboard('{Control>}g{/Control}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('opens on Ctrl+G while hovering the table, with no click or focus at all', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <>
          <button>Outside</button>
          <ReadOnlyTable<Row>
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            measure={measure}
            enableColumnJump
          />
        </>,
      )
      // Focus stays on <body> (nothing is clicked or focused) — only hover
      // should be enough to scope the shortcut to this table.
      await user.hover(screen.getByText('Avocado'))
      await user.keyboard('{Control>}g{/Control}')
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })
  })

  it('stops responding once the mouse leaves and no focus was ever established', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <>
          <button>Outside</button>
          <ReadOnlyTable<Row>
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            measure={measure}
            enableColumnJump
          />
        </>,
      )
      await user.hover(screen.getByText('Avocado'))
      await user.unhover(screen.getByText('Avocado'))
      await user.keyboard('{Control>}g{/Control}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('columnJumpGlobalShortcut opens the dialog with no hover or focus at all', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <>
          <button>Outside</button>
          <ReadOnlyTable<Row>
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            measure={measure}
            enableColumnJump
            columnJumpGlobalShortcut
          />
        </>,
      )
      await user.click(screen.getByRole('button', { name: 'Outside' }))
      await user.keyboard('{Control>}g{/Control}')
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })
  })

  it('lists every column and filters as the user types', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
          enableColumnJump
        />,
      )
      await openViaShortcut(user)
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('button', { name: 'City' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Country' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Name' })).toBeInTheDocument()
      await user.type(within(dialog).getByRole('textbox'), 'coun')
      expect(within(dialog).getByRole('button', { name: 'Country' })).toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'Name' })).not.toBeInTheDocument()
    })
  })

  it('excludes hidden columns when columnJumpIncludeHidden is false', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
          enableColumnJump
          enableColumnVisibility
          columnJumpIncludeHidden={false}
        />,
      )
      await user.click(screen.getByRole('button', { name: /Columns/ }))
      await user.click(await screen.findByRole('menuitemcheckbox', { name: 'City' }))
      await waitFor(() => expect(screen.queryByText('Lima')).not.toBeInTheDocument())

      await user.keyboard('{Escape}') // close the Columns menu first
      await openViaShortcut(user)
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByRole('button', { name: /City/ })).not.toBeInTheDocument()
    })
  })

  it('selecting a hidden column un-hides it and scrolls to it (included by default)', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
          enableColumnJump
          enableColumnVisibility
        />,
      )
      await user.click(screen.getByRole('button', { name: /Columns/ }))
      await user.click(await screen.findByRole('menuitemcheckbox', { name: 'City' }))
      await waitFor(() => expect(screen.queryByText('Lima')).not.toBeInTheDocument())
      await user.keyboard('{Escape}')

      await openViaShortcut(user)
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'CityHidden' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(screen.getByText('Lima')).toBeInTheDocument())
    })
  })
})

describe('column jump — editable table', () => {
  it('opens the same way as ReadOnlyTable', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <EditableTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
          enableColumnJump
          editableColumnIds={['name']}
          onSaveEdit={async () => true}
        />,
      )
      await openViaShortcut(user)
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })
  })
})

describe('column jump — shared tabbed table', () => {
  const sharedTabs: TabbedTableTab<Row>[] = [
    { id: 'a', label: 'Tab A', columns: [textColumn<Row>('name', 'Name')] },
    { id: 'b', label: 'Tab B', columns: [textColumn<Row>('country', 'Country')] },
  ]

  function activeTable(container: HTMLElement): HTMLElement {
    const panels = container.querySelectorAll<HTMLElement>('[data-tgx-table]')
    return panels[panels.length - 1]!
  }

  it('lists columns from every tab and switches tabs on selection', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const { container } = render(
        <TabbedTable<Row>
          data={data}
          getRowId={(r) => r.id}
          idColumn="id"
          tabs={sharedTabs}
          enableColumnJump
        />,
      )
      await user.click(within(activeTable(container)).getByRole('button', { name: /^Name/ }))
      await user.keyboard('{Control>}g{/Control}')
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('button', { name: 'Name' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: /Country.*Tab B|Tab B.*Country/ })).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: /Country/ }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() =>
        expect(within(activeTable(container)).getByText('Peru')).toBeInTheDocument(),
      )
    })
  })
})

describe('column jump — independent tabbed table', () => {
  type OtherRow = { id: string; total: number }

  function activeTable(container: HTMLElement): HTMLElement {
    const panels = container.querySelectorAll<HTMLElement>('[data-tgx-table]')
    return panels[panels.length - 1]!
  }

  it('switches tabs across independent tables on selection', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const tabA = independentTable<Row>({
        id: 'a',
        label: 'Tab A',
        data,
        getRowId: (r) => r.id,
        columns: [textColumn<Row>('name', 'Name')],
      })
      const tabB = independentTable<OtherRow>({
        id: 'b',
        label: 'Tab B',
        data: [{ id: '1', total: 42 }],
        getRowId: (r) => r.id,
        columns: [
          {
            id: 'total',
            header: 'Total',
            accessorKey: 'total',
            cell: ({ getValue }) => String(getValue()),
          },
        ],
      })
      const { container } = render(
        <IndependentTabbedTable tabs={[tabA, tabB]} enableColumnJump measure={measure} />,
      )
      await user.click(within(activeTable(container)).getByRole('button', { name: /^Name/ }))
      await user.keyboard('{Control>}g{/Control}')
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: /Total/ }))
      await waitFor(() => expect(within(activeTable(container)).getByText('42')).toBeInTheDocument())
    })
  })
})
