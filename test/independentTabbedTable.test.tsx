import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import {
  IndependentTabbedTable,
  independentTable,
} from '../src/components/IndependentTabbedTable'
import { textColumn, numberColumn } from '../src/lib/columns'
import type { MeasureTextFn } from '../src/types'

const measure: MeasureTextFn = (text) => text.length * 8

// Two tabs with COMPLETELY different row shapes — the whole point of this mode.
type Person = { id: string; name: string; city: string }
type Order = { ref: string; total: number }

const people: Person[] = [
  { id: '1', name: 'Bravo', city: 'York' },
  { id: '2', name: 'Alpha', city: 'Zurich' },
]
const orders: Order[] = [
  { ref: 'A-100', total: 50 },
  { ref: 'A-200', total: 10 },
]

/** The active panel is the last table; exiting panels can linger mid-animation. */
function activeTable(container: HTMLElement): HTMLElement {
  const panels = container.querySelectorAll<HTMLElement>('[data-tgx-table]')
  return panels[panels.length - 1]!
}

// jsdom reports zero-sized elements, so the body virtualizer renders nothing.
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

function makeTabs(onSave?: (row: Order, col: string, val: unknown) => void) {
  const peopleTab = independentTable<Person>({
    id: 'people',
    label: 'People',
    data: people,
    getRowId: (r) => r.id,
    columns: [textColumn<Person>('name', 'Name'), textColumn<Person>('city', 'City')],
    measure,
  })
  const ordersTab = onSave
    ? independentTable<Order>({
        id: 'orders',
        label: 'Orders',
        data: orders,
        getRowId: (r) => r.ref,
        columns: [
          textColumn<Order>('ref', 'Ref'),
          numberColumn<Order>('total', 'Total', { editable: true }),
        ],
        measure,
        editable: true,
        editableColumnIds: ['total'],
        onSaveEdit: async (row, col, val) => {
          onSave(row, col, val)
          return true
        },
      })
    : independentTable<Order>({
        id: 'orders',
        label: 'Orders',
        data: orders,
        getRowId: (r) => r.ref,
        columns: [textColumn<Order>('ref', 'Ref'), numberColumn<Order>('total', 'Total')],
        measure,
      })
  return [peopleTab, ordersTab]
}

afterEach(() => {
  window.localStorage.clear()
})

describe('IndependentTabbedTable independence', () => {
  it('renders heterogeneous row shapes per tab', async () => {
    await withElementSize(async () => {
      const user = userEvent.setup()
      const { container, getByRole } = render(
        <IndependentTabbedTable tabs={makeTabs()} defaultTabId="people" />,
      )

      // People tab shows people columns/rows.
      expect(await within(activeTable(container)).findByText('Bravo')).toBeInTheDocument()
      expect(within(activeTable(container)).queryByText('A-100')).not.toBeInTheDocument()

      // Switch to Orders — a different row shape entirely.
      await user.click(getByRole('button', { name: 'Orders' }))
      await waitFor(() =>
        expect(within(activeTable(container)).queryByText('A-100')).toBeInTheDocument(),
      )
      expect(within(activeTable(container)).queryByText('Bravo')).not.toBeInTheDocument()
    })
  })

  it('keeps sorting independent and persisted per tab across switches', async () => {
    await withElementSize(async () => {
      const user = userEvent.setup()
      const { container, getByRole } = render(
        <IndependentTabbedTable tabs={makeTabs()} defaultTabId="people" />,
      )

      // Sort People by Name.
      await user.click(within(activeTable(container)).getByRole('button', { name: /^Name/ }))
      expect(
        within(activeTable(container)).getByRole('button', { name: /^Name/ }),
      ).toHaveAttribute('aria-sort', 'ascending')

      // Orders tab is unaffected — nothing sorted there.
      await user.click(getByRole('button', { name: 'Orders' }))
      await waitFor(() =>
        expect(
          within(activeTable(container)).getByRole('button', { name: /^Ref/ }),
        ).not.toHaveAttribute('aria-sort'),
      )
      // Sort Orders by Total (independent of People's sort). Number columns
      // sort descending-first in TanStack.
      await user.click(within(activeTable(container)).getByRole('button', { name: /^Total/ }))
      expect(
        within(activeTable(container)).getByRole('button', { name: /^Total/ }),
      ).toHaveAttribute('aria-sort', 'descending')

      // Back on People, its own Name sort is preserved; Total is unknown here.
      await user.click(getByRole('button', { name: 'People' }))
      await waitFor(() =>
        expect(
          within(activeTable(container)).getByRole('button', { name: /^Name/ }),
        ).toHaveAttribute('aria-sort', 'ascending'),
      )
    })
  })

  it('keeps row selection independent per tab', async () => {
    await withElementSize(async () => {
      const user = userEvent.setup()
      const tabs = [
        independentTable<Person>({
          id: 'people',
          label: 'People',
          data: people,
          getRowId: (r) => r.id,
          columns: [textColumn<Person>('name', 'Name')],
          enableRowSelection: true,
          measure,
        }),
        independentTable<Order>({
          id: 'orders',
          label: 'Orders',
          data: orders,
          getRowId: (r) => r.ref,
          columns: [textColumn<Order>('ref', 'Ref')],
          enableRowSelection: true,
          measure,
        }),
      ]
      const { container, getByRole } = render(
        <IndependentTabbedTable tabs={tabs} defaultTabId="people" />,
      )

      // Select the first People row.
      const peopleCb = within(activeTable(container)).getAllByLabelText('Select row')[0]!
      await user.click(peopleCb)
      expect(peopleCb).toBeChecked()

      // Orders tab has no selection (independent).
      await user.click(getByRole('button', { name: 'Orders' }))
      await waitFor(() =>
        expect(
          within(activeTable(container)).getAllByLabelText('Select row')[0]!,
        ).not.toBeChecked(),
      )

      // Back to People — its selection survived the switch.
      await user.click(getByRole('button', { name: 'People' }))
      await waitFor(() =>
        expect(
          within(activeTable(container)).getAllByLabelText('Select row')[0]!,
        ).toBeChecked(),
      )
    })
  })

  it('supports controlled selection, lifted per tab into the caller', async () => {
    await withElementSize(async () => {
      const user = userEvent.setup()

      function Harness() {
        const [peopleSelected, setPeopleSelected] = useState<string[]>([])
        const [ordersSelected, setOrdersSelected] = useState<string[]>(['A-100'])
        const tabs = [
          independentTable<Person>({
            id: 'people',
            label: 'People',
            data: people,
            getRowId: (r) => r.id,
            columns: [textColumn<Person>('name', 'Name')],
            enableRowSelection: true,
            selectedRowIds: peopleSelected,
            onSelectedRowIdsChange: setPeopleSelected,
            measure,
          }),
          independentTable<Order>({
            id: 'orders',
            label: 'Orders',
            data: orders,
            getRowId: (r) => r.ref,
            columns: [textColumn<Order>('ref', 'Ref')],
            enableRowSelection: true,
            selectedRowIds: ordersSelected,
            onSelectedRowIdsChange: setOrdersSelected,
            measure,
          }),
        ]
        return (
          <>
            <IndependentTabbedTable tabs={tabs} defaultTabId="people" />
            <div data-testid="people-selected">{peopleSelected.join(',')}</div>
          </>
        )
      }

      const { container, getByRole, getByTestId } = render(<Harness />)

      // Orders starts pre-selected from caller-owned state (controlled seed).
      await user.click(getByRole('button', { name: 'Orders' }))
      await waitFor(() =>
        expect(
          within(activeTable(container)).getAllByLabelText('Select row')[0]!,
        ).toBeChecked(),
      )

      // People starts empty and unaffected by Orders' controlled selection.
      await user.click(getByRole('button', { name: 'People' }))
      await waitFor(() =>
        expect(
          within(activeTable(container)).getAllByLabelText('Select row')[0]!,
        ).not.toBeChecked(),
      )
      // Checking it calls back into the caller's own state (not internal store state).
      await user.click(within(activeTable(container)).getAllByLabelText('Select row')[0]!)
      await waitFor(() => expect(getByTestId('people-selected').textContent).toBe('1'))
      expect(
        within(activeTable(container)).getAllByLabelText('Select row')[0]!,
      ).toBeChecked()
    })
  })

  it('renders the first tab when the active tab id is invalid', async () => {
    await withElementSize(async () => {
      // Uncontrolled: a stale defaultTabId must still render the first tab.
      const { container, unmount } = render(
        <IndependentTabbedTable tabs={makeTabs()} defaultTabId="nope" />,
      )
      expect(await within(activeTable(container)).findByText('Bravo')).toBeInTheDocument()
      unmount()

      // Controlled: a stale activeTabId must still render the first tab.
      const controlled = render(
        <IndependentTabbedTable tabs={makeTabs()} activeTabId="ghost" />,
      )
      expect(
        await within(activeTable(controlled.container)).findByText('Bravo'),
      ).toBeInTheDocument()
    })
  })

  it('saves edits on an editable independent tab', async () => {
    await withElementSize(async () => {
      const saved: { ref: string; col: string; val: unknown }[] = []
      const user = userEvent.setup()
      const { container, getByRole } = render(
        <IndependentTabbedTable
          tabs={makeTabs((row, col, val) => saved.push({ ref: row.ref, col, val }))}
          defaultTabId="orders"
        />,
      )

      const cell = await within(activeTable(container)).findByText('50')
      await user.dblClick(cell)
      const input = await within(activeTable(container)).findByRole('spinbutton')
      await user.clear(input)
      await user.type(input, '999')
      await user.keyboard('{Enter}')

      await waitFor(() => expect(saved).toHaveLength(1))
      expect(saved[0]).toMatchObject({ ref: 'A-100', col: 'total', val: 999 })

      // The People tab remains read-only and unaffected.
      await user.click(getByRole('button', { name: 'People' }))
      await waitFor(() =>
        expect(within(activeTable(container)).queryByText('Bravo')).toBeInTheDocument(),
      )
    })
  })
})

describe('IndependentTabbedTable column picker show-all / hide-all', () => {
  type PRow = { id: string; code: string; name: string; city: string }

  const pData: PRow[] = [
    { id: '1', code: 'C1', name: 'Bravo', city: 'York' },
    { id: '2', code: 'C2', name: 'Alpha', city: 'Zurich' },
  ]

  it('hides/shows all on the active tab, persists per tab, and leaves locked columns untouched', async () => {
    await withElementSize(async () => {
      const user = userEvent.setup()
      // People's `code` is locked (enableHiding: false); name and city hideable.
      const peopleTab = independentTable<PRow>({
        id: 'people',
        label: 'People',
        data: pData,
        getRowId: (r) => r.id,
        columns: [
          { ...textColumn<PRow>('code', 'Code'), enableHiding: false },
          textColumn<PRow>('name', 'Name'),
          textColumn<PRow>('city', 'City'),
        ],
        enableColumnVisibility: true,
        columnVisibilityStorageKey: 'tgx-test-indep-picker-all',
        measure,
      })
      const ordersTab = independentTable<Order>({
        id: 'orders',
        label: 'Orders',
        data: orders,
        getRowId: (r) => r.ref,
        columns: [textColumn<Order>('ref', 'Ref'), numberColumn<Order>('total', 'Total')],
        measure,
      })
      const { container, getByRole } = render(
        <IndependentTabbedTable tabs={[peopleTab, ordersTab]} defaultTabId="people" />,
      )

      // All three People columns render initially.
      expect(await within(activeTable(container)).findByText('Bravo')).toBeInTheDocument()
      expect(within(activeTable(container)).getByText('York')).toBeInTheDocument()
      expect(within(activeTable(container)).getByText('C1')).toBeInTheDocument()

      // Open the picker. Everything visible → "Show all" disabled, "Hide all" enabled.
      await user.click(getByRole('button', { name: /Columns/ }))
      const showAll = await screen.findByRole('button', { name: 'Show all' })
      const hideAll = await screen.findByRole('button', { name: 'Hide all' })
      expect(showAll).toBeDisabled()
      expect(hideAll).toBeEnabled()
      // The locked Code column is not in the picker.
      expect(screen.getByRole('menuitemcheckbox', { name: 'Name' })).toBeInTheDocument()
      expect(screen.getByRole('menuitemcheckbox', { name: 'City' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitemcheckbox', { name: 'Code' })).not.toBeInTheDocument()

      // Hide all hideable columns (routed through the per-tab visibility store).
      await user.click(hideAll)
      await waitFor(() => {
        expect(within(activeTable(container)).queryByText('Bravo')).not.toBeInTheDocument()
        expect(within(activeTable(container)).queryByText('York')).not.toBeInTheDocument()
      })
      // The locked Code column is untouched.
      expect(within(activeTable(container)).getByText('C1')).toBeInTheDocument()
      // The bulk toggle is persisted under this tab's own storage key.
      expect(
        JSON.parse(window.localStorage.getItem('tgx-test-indep-picker-all') ?? '{}'),
      ).toMatchObject({ name: false, city: false })

      // Now everything hidden → "Hide all" disabled, "Show all" enabled.
      expect(screen.getByRole('button', { name: 'Hide all' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Show all' })).toBeEnabled()

      // Close the picker, switch to Orders and back — People's hide-all persists per tab.
      await user.keyboard('{Escape}')
      await user.click(getByRole('button', { name: 'Orders' }))
      await waitFor(() =>
        expect(within(activeTable(container)).queryByText('A-100')).toBeInTheDocument(),
      )
      await user.click(getByRole('button', { name: 'People' }))
      await waitFor(() =>
        expect(within(activeTable(container)).queryByText('C1')).toBeInTheDocument(),
      )
      expect(within(activeTable(container)).queryByText('Bravo')).not.toBeInTheDocument()

      // Show all reveals the hideable columns again.
      await user.click(getByRole('button', { name: /Columns/ }))
      await user.click(await screen.findByRole('button', { name: 'Show all' }))
      await waitFor(() => {
        expect(within(activeTable(container)).queryByText('Bravo')).toBeInTheDocument()
        expect(within(activeTable(container)).queryByText('York')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: 'Show all' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Hide all' })).toBeEnabled()
    })
  })
})

describe('IndependentTabbedTable tab column preview', () => {
  function previewTabs() {
    return [
      independentTable<Person>({
        id: 'people',
        label: 'People',
        data: people,
        getRowId: (r) => r.id,
        columns: [
          textColumn<Person>('name', 'Name'),
          textColumn<Person>('city', 'City'),
          { ...textColumn<Person>('id', 'Id'), enableHiding: false },
        ],
        measure,
      }),
      independentTable<Order>({
        id: 'orders',
        label: 'Orders',
        data: orders,
        getRowId: (r) => r.ref,
        columns: [textColumn<Order>('ref', 'Ref')],
        measure,
      }),
    ]
  }

  it('shows no preview popover when the feature is off', async () => {
    const user = userEvent.setup()
    render(
      <IndependentTabbedTable
        tabs={previewTabs()}
        defaultTabId="people"
        tabColumnPreviewDelayMs={10}
      />,
    )
    await user.hover(screen.getByRole('button', { name: 'People' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it("lists a tab's hideable columns alphabetically after the hover delay", async () => {
    const user = userEvent.setup()
    render(
      <IndependentTabbedTable
        tabs={previewTabs()}
        defaultTabId="people"
        enableTabColumnPreview
        tabColumnPreviewDelayMs={10}
      />,
    )
    await user.hover(screen.getByRole('button', { name: 'People' }))
    const tooltip = await screen.findByRole('tooltip')
    // Alphabetical: City before Name. The enableHiding:false Id column is excluded.
    expect(tooltip.textContent).toBe('CityName')
  })

  it('still selects the tab on click while a preview popover is open', async () => {
    await withElementSize(async () => {
      const user = userEvent.setup()
      const { container } = render(
        <IndependentTabbedTable
          tabs={previewTabs()}
          defaultTabId="people"
          enableTabColumnPreview
          tabColumnPreviewDelayMs={10}
        />,
      )
      const ordersButton = screen.getByRole('button', { name: 'Orders' })
      await user.hover(ordersButton)
      await screen.findByRole('tooltip')
      await user.click(ordersButton)
      await waitFor(() =>
        expect(within(activeTable(container)).queryByText('A-100')).toBeInTheDocument(),
      )
    })
  })
})
