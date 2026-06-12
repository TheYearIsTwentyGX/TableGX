import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TabbedTable } from '../src/components/TabbedTable'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn, TabbedTableTab } from '../src/types'

type Row = { id: string; name: string; city: string }

const measure: MeasureTextFn = (text) => text.length * 8

const data: Row[] = [
  { id: '1', name: 'Bravo', city: 'York' },
  { id: '2', name: 'Alpha', city: 'Zurich' },
]

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

  it('keeps a sort on a column another tab lacks without warning, and restores it', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
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

      // Sort Tab A by City — a column Tab B doesn't have.
      await user.click(within(activeTable(container)).getByRole('button', { name: /^City/ }))
      expect(
        within(activeTable(container)).getByRole('button', { name: /^City/ }),
      ).toHaveAttribute('aria-sort', 'ascending')

      // Tab B renders unsorted (the foreign entry is filtered out) and TanStack
      // never sees the unknown column id.
      await user.click(getByRole('button', { name: 'Tab B' }))
      await waitFor(() =>
        expect(
          within(activeTable(container)).getByRole('button', { name: /^Name/ }),
        ).not.toHaveAttribute('aria-sort'),
      )

      // The City sort is preserved in the shared state and reappears on Tab A.
      await user.click(getByRole('button', { name: 'Tab A' }))
      await waitFor(() =>
        expect(
          within(activeTable(container)).getByRole('button', { name: /^City/ }),
        ).toHaveAttribute('aria-sort', 'ascending'),
      )

      const allLogs = [...errorSpy.mock.calls, ...warnSpy.mock.calls].flat().map(String)
      expect(allLogs.filter((m) => m.includes('does not exist'))).toEqual([])
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
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
