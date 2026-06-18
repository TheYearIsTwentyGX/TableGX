import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SortingState } from '@tanstack/react-table'
import { describe, expect, it } from 'vitest'
import {
  Table,
  type TableBodyRenderArgs,
  type TableTabModel,
} from '../src/primitives'

/**
 * A minimal, generic-erased tab model whose body surfaces the store-computed
 * args (sorting + selection) and exposes buttons to push changes back through
 * the store. This lets us assert the store's shared vs independent semantics
 * without standing up a full TableCore.
 */
function probeTab(id: string, label: string): TableTabModel {
  return {
    id,
    label,
    enableRowSelection: true,
    enableGlobalSearch: false,
    showsTopRecordCount: false,
    getPickerItems: () => [],
    render: (args: TableBodyRenderArgs) => (
      <div data-testid={`body-${id}`}>
        <span data-testid={`sorting-${id}`}>{JSON.stringify(args.sorting)}</span>
        <span data-testid={`selected-${id}`}>
          {JSON.stringify(args.selectedRowIds ?? [])}
        </span>
        <button
          type="button"
          onClick={() =>
            args.onSortingChange([{ id: 'name', desc: false }] as SortingState)
          }
        >
          {`sort-${id}`}
        </button>
        <button type="button" onClick={() => args.onSelectedRowIdsChange(['r1'])}>
          {`select-${id}`}
        </button>
      </div>
    ),
  }
}

describe('compound primitives', () => {
  it('composes a plain (no-tab) body via Table.Provider + Table.Body', () => {
    render(
      <Table.Provider mode="shared" tabs={[probeTab('a', 'Tab A')]}>
        <Table.Container>
          <Table.Body />
        </Table.Container>
      </Table.Provider>,
    )
    // The active tab's body renders even without a tab strip or panel host.
    expect(screen.getByTestId('body-a')).toBeInTheDocument()
  })

  it('renders chrome slots in the caller-supplied order and omits unspecified ones', () => {
    render(
      <Table.Provider mode="shared" tabs={[probeTab('a', 'Tab A')]}>
        <Table.Container>
          <Table.TabStrip
            endContent={
              <>
                <button type="button">first-action</button>
                <button type="button">second-action</button>
              </>
            }
          />
          <Table.Body />
        </Table.Container>
      </Table.Provider>,
    )
    const strip = document.querySelector<HTMLElement>('[data-tgx-tab-strip]')!
    const text = strip.textContent ?? ''
    // Caller order is preserved within the strip.
    expect(text.indexOf('first-action')).toBeLessThan(text.indexOf('second-action'))
    // Center slot was omitted, so no filter badges chrome leaks in.
    expect(strip.querySelector('[data-tgx-filter-badges]')).toBeNull()
  })

  it('switches the active tab through the store when a tab button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <Table.Provider mode="shared" tabs={[probeTab('a', 'Tab A'), probeTab('b', 'Tab B')]}>
        <Table.Container>
          <Table.TabStrip />
          <Table.Body />
        </Table.Container>
      </Table.Provider>,
    )
    // First tab is active by default.
    expect(screen.getByTestId('body-a')).toBeInTheDocument()
    expect(screen.queryByTestId('body-b')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Tab B' }))
    expect(screen.getByTestId('body-b')).toBeInTheDocument()
    expect(screen.queryByTestId('body-a')).toBeNull()
  })

  it('shares sorting and selection across tabs in shared mode', async () => {
    const user = userEvent.setup()
    render(
      <Table.Provider
        mode="shared"
        enableRowSelection
        tabs={[probeTab('a', 'Tab A'), probeTab('b', 'Tab B')]}
      >
        <Table.Container>
          <Table.TabStrip />
          <Table.Body />
        </Table.Container>
      </Table.Provider>,
    )
    await user.click(screen.getByRole('button', { name: 'sort-a' }))
    await user.click(screen.getByRole('button', { name: 'select-a' }))

    // Switching to Tab B carries the shared sorting + selection over.
    await user.click(screen.getByRole('button', { name: 'Tab B' }))
    expect(screen.getByTestId('sorting-b').textContent).toContain('"name"')
    expect(screen.getByTestId('selected-b').textContent).toBe('["r1"]')
  })

  it('isolates sorting and selection per tab in independent mode', async () => {
    const user = userEvent.setup()
    render(
      <Table.Provider
        mode="independent"
        tabs={[probeTab('a', 'Tab A'), probeTab('b', 'Tab B')]}
      >
        <Table.Container>
          <Table.TabStrip />
          <Table.Body />
        </Table.Container>
      </Table.Provider>,
    )
    await user.click(screen.getByRole('button', { name: 'sort-a' }))
    await user.click(screen.getByRole('button', { name: 'select-a' }))

    // Tab B keeps its own (empty) sorting + selection — nothing leaks across.
    await user.click(screen.getByRole('button', { name: 'Tab B' }))
    expect(screen.getByTestId('sorting-b').textContent).toBe('[]')
    expect(screen.getByTestId('selected-b').textContent).toBe('[]')
  })
})
