import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { needsHeaderIconOverlay } from '../src/core/HeaderCell'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn } from '../src/types'

describe('needsHeaderIconOverlay', () => {
  it('is false when there are no icons to float', () => {
    expect(needsHeaderIconOverlay({ columnWidth: 40, textWidth: 200, iconsWidth: 0 })).toBe(false)
  })

  it('is false when there is no header text to overlay', () => {
    expect(needsHeaderIconOverlay({ columnWidth: 40, textWidth: 0, iconsWidth: 30 })).toBe(false)
  })

  it('is false when the text and icons fit side by side', () => {
    // available = 200 - 24 = 176; needed = 100 + 4 + 30 = 134 <= 176.
    expect(needsHeaderIconOverlay({ columnWidth: 200, textWidth: 100, iconsWidth: 30 })).toBe(false)
  })

  it('is true when the text and icons cannot sit side by side', () => {
    // available = 120 - 24 = 96; needed = 100 + 4 + 30 = 134 > 96.
    expect(needsHeaderIconOverlay({ columnWidth: 120, textWidth: 100, iconsWidth: 30 })).toBe(true)
  })

  it('honors custom padding and gap, tipping over by a single pixel', () => {
    // exactly filled is not an overlay; one extra pixel of text floats the icons.
    expect(
      needsHeaderIconOverlay({ columnWidth: 100, textWidth: 80, iconsWidth: 20, padding: 0, gap: 0 }),
    ).toBe(false)
    expect(
      needsHeaderIconOverlay({ columnWidth: 100, textWidth: 81, iconsWidth: 20, padding: 0, gap: 0 }),
    ).toBe(true)
  })
})

describe('HeaderCell sort/filter affordances', () => {
  type Row = { id: string; name: string }
  const measure: MeasureTextFn = (text) => text.length * 8
  const columns = [textColumn<Row>('name', 'Name')]
  const data: Row[] = [
    { id: '1', name: 'Alpha' },
    { id: '2', name: 'Beta' },
  ]

  it('renders the sort + filter affordances grouped under a single cluster', () => {
    const { container } = render(
      <ReadOnlyTable<Row> data={data} columns={columns} getRowId={(r) => r.id} measure={measure} />,
    )
    const sort = container.querySelector('[data-tgx-sort-affordance]')
    const filter = container.querySelector('[data-tgx-filter-affordance]')
    expect(sort).not.toBeNull()
    expect(filter).not.toBeNull()
    // Both affordances live in the same cluster element.
    expect(sort?.parentElement).toBe(filter?.parentElement)
  })

  it('keeps the sort toggle and filter popover interactive', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ReadOnlyTable<Row> data={data} columns={columns} getRowId={(r) => r.id} measure={measure} />,
    )
    const header = container.querySelector<HTMLElement>('[data-tgx-header="name"]')
    if (!header) throw new Error('no header rendered')
    expect(header).not.toHaveAttribute('aria-sort')

    // Clicking the header toggles sorting (aria reflects the new state).
    await user.click(header)
    await waitFor(() => expect(header).toHaveAttribute('aria-sort'))

    // The filter affordance opens its popover without triggering a header sort.
    await user.click(screen.getByRole('button', { name: 'Filter Name' }))
    expect(await screen.findByPlaceholderText(/search name/i)).toBeInTheDocument()
  })

  it('closes the filter popover when OK is clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ReadOnlyTable<Row> data={data} columns={columns} getRowId={(r) => r.id} measure={measure} />,
    )
    const header = container.querySelector<HTMLElement>('[data-tgx-header="name"]')
    if (!header) throw new Error('no header rendered')

    await user.click(screen.getByRole('button', { name: 'Filter Name' }))
    expect(await screen.findByPlaceholderText(/search name/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(screen.queryByPlaceholderText(/search name/i)).not.toBeInTheDocument())
  })
})
