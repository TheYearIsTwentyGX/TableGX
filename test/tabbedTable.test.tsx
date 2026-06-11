import { render, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
