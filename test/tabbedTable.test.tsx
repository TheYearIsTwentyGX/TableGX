import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TabbedTable } from '../src/components/TabbedTable'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn, TabbedTableTab } from '../src/types'

type Row = { id: string; name: string; city: string }

const measure: MeasureTextFn = (text) => text.length * 8

const data: Row[] = [
  { id: '1', name: 'Bravo', city: 'Madrid' },
  { id: '2', name: 'Alpha', city: 'Zurich' },
  { id: '3', name: 'Cairo', city: 'Lima' },
]

/** Names in the order they're rendered in the active table's body. */
function renderedNameOrder(container: HTMLElement): string[] {
  const text = activeTable(container).textContent ?? ''
  return (['Alpha', 'Bravo', 'Cairo'] as const)
    .map((name) => ({ name, index: text.indexOf(name) }))
    .filter((e) => e.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((e) => e.name)
}

// Both tabs share the `name` column; only Tab A has `city`.
const tabs: TabbedTableTab<Row>[] = [
  {
    id: 'a',
    label: 'Tab A',
    columns: [textColumn<Row>('name', 'Name'), textColumn<Row>('city', 'City')],
  },
  { id: 'b', label: 'Tab B', columns: [textColumn<Row>('name', 'Name')] },
]

/** The active panel is the last table; exiting panels can linger mid-animation. */
function activeTable(container: HTMLElement): HTMLElement {
  const panels = container.querySelectorAll<HTMLElement>('[data-tgx-table]')
  return panels[panels.length - 1]!
}

// jsdom reports zero-sized elements, so the body virtualizer renders nothing.
// Give elements a size for the duration of `fn`, then restore descriptors.
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

describe('TabbedTable shared sorting', () => {
  it('carries a sort applied on one tab to the other tabs and back', async () => {
    const user = userEvent.setup()
    const { container, getByRole } = render(
      <TabbedTable<Row>
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabs}
        defaultTabId="a"
        measure={measure}
      />,
    )

    // Sort Tab A by Name (asc). The header's accessible name includes the
    // resize handle's label, so match by prefix.
    await user.click(within(activeTable(container)).getByRole('button', { name: /^Name/ }))
    expect(
      within(activeTable(container)).getByRole('button', { name: /^Name/ }),
    ).toHaveAttribute('aria-sort', 'ascending')

    // The shared sort applies on Tab B too.
    await user.click(getByRole('button', { name: 'Tab B' }))
    await waitFor(() =>
      expect(
        within(activeTable(container)).getByRole('button', { name: /^Name/ }),
      ).toHaveAttribute('aria-sort', 'ascending'),
    )

    // And survives the round trip back to Tab A.
    await user.click(getByRole('button', { name: 'Tab A' }))
    await waitFor(() =>
      expect(
        within(activeTable(container)).getByRole('button', { name: /^Name/ }),
      ).toHaveAttribute('aria-sort', 'ascending'),
    )
  })

  it('orders a tab by a column it lacks, with no header indicator or warning, across a round trip', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await withElementSize(async () => {
        const user = userEvent.setup()
        const { container, getByRole } = render(
          <TabbedTable<Row>
            data={data}
            getRowId={(r) => r.id}
            idColumn="id"
            tabs={tabs}
            defaultTabId="a"
            measure={measure}
          />,
        )

        // Sort Tab A by City (asc) — a column Tab B doesn't have. City asc is
        // Lima(Cairo) < Madrid(Bravo) < Zurich(Alpha).
        await user.click(within(activeTable(container)).getByRole('button', { name: /^City/ }))
        expect(
          within(activeTable(container)).getByRole('button', { name: /^City/ }),
        ).toHaveAttribute('aria-sort', 'ascending')
        await waitFor(() =>
          expect(renderedNameOrder(container)).toEqual(['Cairo', 'Bravo', 'Alpha']),
        )

        // Tab B has no City column, so it shows no sort indicator — but its rows
        // are still ordered by City via the hidden sort-only column.
        await user.click(getByRole('button', { name: 'Tab B' }))
        await waitFor(() =>
          expect(
            within(activeTable(container)).getByRole('button', { name: /^Name/ }),
          ).not.toHaveAttribute('aria-sort'),
        )
        await waitFor(() =>
          expect(renderedNameOrder(container)).toEqual(['Cairo', 'Bravo', 'Alpha']),
        )

        // The City sort is preserved in the shared state: Tab A shows its
        // indicator again and the same order.
        await user.click(getByRole('button', { name: 'Tab A' }))
        await waitFor(() =>
          expect(
            within(activeTable(container)).getByRole('button', { name: /^City/ }),
          ).toHaveAttribute('aria-sort', 'ascending'),
        )
        await waitFor(() =>
          expect(renderedNameOrder(container)).toEqual(['Cairo', 'Bravo', 'Alpha']),
        )

        const allLogs = [...errorSpy.mock.calls, ...warnSpy.mock.calls].flat().map(String)
        expect(allLogs.filter((m) => m.includes('does not exist'))).toEqual([])
      })
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})

describe('TabbedTable sort-hierarchy popover', () => {
  it('does not render the Sort button unless enabled', async () => {
    render(
      <TabbedTable<Row>
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabs}
        defaultTabId="a"
        measure={measure}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Manage sort order' })).not.toBeInTheDocument()
  })

  it('shows an empty state when nothing is sorted', async () => {
    const user = userEvent.setup()
    render(
      <TabbedTable<Row>
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabs}
        defaultTabId="a"
        enableSortHierarchy
        measure={measure}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Manage sort order' }))
    expect(await screen.findByText(/No active sort/i)).toBeInTheDocument()
    // The multi-sort tip is shown even when nothing is sorted yet.
    expect(screen.getByText(/Shift-click a column header/i)).toBeInTheDocument()
  })

  it('lists sorted columns in priority order with correct directions', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <TabbedTable<Row>
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabs}
        defaultTabId="a"
        enableMultiSort
        enableSortHierarchy
        measure={measure}
      />,
    )

    // Sort by Name (asc), then add City (asc) with a modifier for multi-sort.
    await user.click(within(activeTable(container)).getByRole('button', { name: /^Name/ }))
    await user.keyboard('{Shift>}')
    await user.click(within(activeTable(container)).getByRole('button', { name: /^City/ }))
    await user.keyboard('{/Shift}')

    await user.click(screen.getByRole('button', { name: 'Manage sort order' }))
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('Name')).toBeInTheDocument()
    expect(within(items[1]!).getByText('City')).toBeInTheDocument()
    // Name is sorted ascending — its flip button is labeled accordingly.
    expect(
      within(items[0]!).getByRole('button', { name: /Name sorted ascending/i }),
    ).toBeInTheDocument()
  })

  it('flips a direction, removes a column, and reorders priority', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <TabbedTable<Row>
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabs}
        defaultTabId="a"
        enableMultiSort
        enableSortHierarchy
        measure={measure}
      />,
    )

    await user.click(within(activeTable(container)).getByRole('button', { name: /^Name/ }))
    await user.keyboard('{Shift>}')
    await user.click(within(activeTable(container)).getByRole('button', { name: /^City/ }))
    await user.keyboard('{/Shift}')

    await user.click(screen.getByRole('button', { name: 'Manage sort order' }))

    // Flip Name to descending — the header sort indicator follows.
    await user.click(screen.getByRole('button', { name: /Name sorted ascending/i }))
    await waitFor(() =>
      expect(
        within(activeTable(container)).getByRole('button', { name: /^Name/ }),
      ).toHaveAttribute('aria-sort', 'descending'),
    )

    // Reorder: move City earlier so it becomes priority 1.
    await user.click(screen.getByRole('button', { name: /Move City earlier/i }))
    await waitFor(() => {
      const items = screen.getAllByRole('listitem')
      expect(within(items[0]!).getByText('City')).toBeInTheDocument()
      expect(within(items[1]!).getByText('Name')).toBeInTheDocument()
    })

    // Remove Name from the sort — its header indicator clears.
    await user.click(screen.getByRole('button', { name: /Remove Name from sort/i }))
    await waitFor(() =>
      expect(
        within(activeTable(container)).getByRole('button', { name: /^Name/ }),
      ).not.toHaveAttribute('aria-sort'),
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('TabbedTable tab column preview', () => {
  const previewTabs: TabbedTableTab<Row>[] = [
    {
      id: 'a',
      label: 'Tab A',
      columns: [
        textColumn<Row>('name', 'Name'),
        textColumn<Row>('city', 'City'),
        { ...textColumn<Row>('id', 'Id'), enableHiding: false },
      ],
    },
    { id: 'b', label: 'Tab B', columns: [textColumn<Row>('name', 'Name')] },
  ]

  it('shows no preview popover when the feature is off', async () => {
    const user = userEvent.setup()
    render(
      <TabbedTable<Row>
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={previewTabs}
        defaultTabId="a"
        measure={measure}
        tabColumnPreviewDelayMs={10}
      />,
    )
    await user.hover(screen.getByRole('button', { name: 'Tab A' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('lists a tab\'s hideable columns alphabetically after the hover delay', async () => {
    const user = userEvent.setup()
    render(
      <TabbedTable<Row>
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={previewTabs}
        defaultTabId="a"
        measure={measure}
        enableTabColumnPreview
        tabColumnPreviewDelayMs={10}
      />,
    )
    await user.hover(screen.getByRole('button', { name: 'Tab A' }))
    const tooltip = await screen.findByRole('tooltip')
    // Alphabetical: City before Name. The enableHiding:false Id column is excluded.
    expect(tooltip.textContent).toBe('CityName')
  })

  it('still selects the tab on click while a preview popover is open', async () => {
    await withElementSize(async () => {
      const user = userEvent.setup()
      const { container } = render(
        <TabbedTable<Row>
          data={data}
          getRowId={(r) => r.id}
          idColumn="id"
          tabs={previewTabs}
          defaultTabId="a"
          measure={measure}
          enableTabColumnPreview
          tabColumnPreviewDelayMs={10}
        />,
      )
      const tabBButton = screen.getByRole('button', { name: 'Tab B' })
      await user.hover(tabBButton)
      await screen.findByRole('tooltip')
      await user.click(tabBButton)
      await waitFor(() =>
        expect(within(activeTable(container)).queryByText('Alpha')).toBeInTheDocument(),
      )
    })
  })
})

describe('TabbedTable invalid active tab fallback', () => {
  it('renders the first tab when defaultTabId does not match any tab', async () => {
    await withElementSize(async () => {
      const { container } = render(
        <TabbedTable<Row>
          data={data}
          getRowId={(r) => r.id}
          idColumn="id"
          tabs={tabs}
          defaultTabId="does-not-exist"
          measure={measure}
        />,
      )
      // A panel must still render — the first tab's content, not a blank shell.
      expect(await within(activeTable(container)).findByText('Bravo')).toBeInTheDocument()
    })
  })

  it('renders the first tab when controlled activeTabId is stale', async () => {
    await withElementSize(async () => {
      const { container } = render(
        <TabbedTable<Row>
          data={data}
          getRowId={(r) => r.id}
          idColumn="id"
          tabs={tabs}
          activeTabId="ghost"
          measure={measure}
        />,
      )
      expect(await within(activeTable(container)).findByText('Bravo')).toBeInTheDocument()
    })
  })
})

describe('TabbedTable frozen column hiding', () => {
  type FRow = { id: string; code: string; name: string; city: string }

  const fData: FRow[] = [
    { id: '1', code: 'C1', name: 'Bravo', city: 'York' },
    { id: '2', code: 'C2', name: 'Alpha', city: 'Zurich' },
  ]

  // Both tabs freeze the first column (`code`); only Tab A also has `city`.
  const fTabs: TabbedTableTab<FRow>[] = [
    {
      id: 'a',
      label: 'Tab A',
      frozenColumns: 1,
      columns: [
        textColumn<FRow>('code', 'Code'),
        textColumn<FRow>('name', 'Name'),
        textColumn<FRow>('city', 'City'),
      ],
    },
    {
      id: 'b',
      label: 'Tab B',
      frozenColumns: 1,
      columns: [textColumn<FRow>('code', 'Code'), textColumn<FRow>('name', 'Name')],
    },
  ]

  afterEach(() => {
    window.localStorage.clear()
  })

  it('hides a frozen column per-tab without leaking, keeping shared selection and sorting', async () => {
    await withElementSize(async () => {
      const user = userEvent.setup()
      const { container, getByRole } = render(
        <TabbedTable<FRow>
          data={fData}
          getRowId={(r) => r.id}
          idColumn="id"
          tabs={fTabs}
          defaultTabId="a"
          enableRowSelection
          enableColumnVisibility
          columnVisibilityStorageKeyBase="tgx-test-frozen"
          measure={measure}
        />,
      )

      // Frozen Code column renders on Tab A.
      expect(await within(activeTable(container)).findByText('C1')).toBeInTheDocument()

      // Shared sort by Name and select the first data row.
      await user.click(within(activeTable(container)).getByRole('button', { name: /^Name/ }))
      expect(
        within(activeTable(container)).getByRole('button', { name: /^Name/ }),
      ).toHaveAttribute('aria-sort', 'ascending')
      const checkbox = within(activeTable(container)).getAllByLabelText('Select row')[0]!
      await user.click(checkbox)
      expect(checkbox).toBeChecked()

      // The frozen Code column appears in the picker; hide it.
      await user.click(getByRole('button', { name: /Columns/ }))
      await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Code' }))
      // Close the menu so its aria-hidden overlay no longer masks the table.
      await user.keyboard('{Escape}')
      await waitFor(() =>
        expect(within(activeTable(container)).queryByText('C1')).not.toBeInTheDocument(),
      )

      // Hiding the frozen column did not disturb shared sorting or selection.
      expect(
        within(activeTable(container)).getByRole('button', { name: /^Name/ }),
      ).toHaveAttribute('aria-sort', 'ascending')
      expect(within(activeTable(container)).getAllByLabelText('Select row')[0]!).toBeChecked()

      // Tab B is unaffected — Code is still visible there (per-tab visibility).
      await user.click(getByRole('button', { name: 'Tab B' }))
      await waitFor(() =>
        expect(within(activeTable(container)).queryByText('C1')).toBeInTheDocument(),
      )
      // Shared selection and sorting carry to Tab B.
      expect(
        within(activeTable(container)).getByRole('button', { name: /^Name/ }),
      ).toHaveAttribute('aria-sort', 'ascending')
      expect(within(activeTable(container)).getAllByLabelText('Select row')[0]!).toBeChecked()

      // Back on Tab A, Code stays hidden (per-tab persistence) and shared state holds.
      await user.click(getByRole('button', { name: 'Tab A' }))
      await waitFor(() =>
        expect(within(activeTable(container)).queryByText('C1')).not.toBeInTheDocument(),
      )
      expect(
        within(activeTable(container)).getByRole('button', { name: /^Name/ }),
      ).toHaveAttribute('aria-sort', 'ascending')
      expect(within(activeTable(container)).getAllByLabelText('Select row')[0]!).toBeChecked()
    })
  })
})

describe('TabbedTable column picker show-all / hide-all', () => {
  type PRow = { id: string; code: string; name: string; city: string }

  const pData: PRow[] = [
    { id: '1', code: 'C1', name: 'Bravo', city: 'York' },
    { id: '2', code: 'C2', name: 'Alpha', city: 'Zurich' },
  ]

  // `code` is locked (enableHiding: false); name and city are hideable.
  const pTabs: TabbedTableTab<PRow>[] = [
    {
      id: 'a',
      label: 'Tab A',
      columns: [
        { ...textColumn<PRow>('code', 'Code'), enableHiding: false },
        textColumn<PRow>('name', 'Name'),
        textColumn<PRow>('city', 'City'),
      ],
    },
  ]

  afterEach(() => {
    window.localStorage.clear()
  })

  it('hides then shows all hideable columns, leaving locked columns untouched', async () => {
    await withElementSize(async () => {
      const user = userEvent.setup()
      const { container, getByRole } = render(
        <TabbedTable<PRow>
          data={pData}
          getRowId={(r) => r.id}
          idColumn="id"
          tabs={pTabs}
          defaultTabId="a"
          enableColumnVisibility
          columnVisibilityStorageKeyBase="tgx-test-picker-all"
          measure={measure}
        />,
      )

      // All three columns render initially.
      expect(await within(activeTable(container)).findByText('Bravo')).toBeInTheDocument()
      expect(within(activeTable(container)).getByText('York')).toBeInTheDocument()
      expect(within(activeTable(container)).getByText('C1')).toBeInTheDocument()

      // Open the picker. Everything visible → "Show all" disabled, "Hide all" enabled.
      await user.click(getByRole('button', { name: /Columns/ }))
      const showAll = await screen.findByRole('button', { name: 'Show all' })
      const hideAll = await screen.findByRole('button', { name: 'Hide all' })
      expect(showAll).toBeDisabled()
      expect(hideAll).toBeEnabled()
      // Only hideable columns are listed (Code is locked out of the picker).
      expect(screen.getByRole('menuitemcheckbox', { name: 'Name' })).toBeInTheDocument()
      expect(screen.getByRole('menuitemcheckbox', { name: 'City' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitemcheckbox', { name: 'Code' })).not.toBeInTheDocument()

      // Hide all hideable columns.
      await user.click(hideAll)
      await waitFor(() => {
        expect(within(activeTable(container)).queryByText('Bravo')).not.toBeInTheDocument()
        expect(within(activeTable(container)).queryByText('York')).not.toBeInTheDocument()
      })
      // The locked Code column is untouched.
      expect(within(activeTable(container)).getByText('C1')).toBeInTheDocument()

      // Now everything hidden → "Hide all" disabled, "Show all" enabled.
      expect(screen.getByRole('button', { name: 'Hide all' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Show all' })).toBeEnabled()

      // Show all reveals the hideable columns again.
      await user.click(screen.getByRole('button', { name: 'Show all' }))
      await waitFor(() => {
        expect(within(activeTable(container)).queryByText('Bravo')).toBeInTheDocument()
        expect(within(activeTable(container)).queryByText('York')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: 'Show all' })).toBeDisabled()
    })
  })
})
