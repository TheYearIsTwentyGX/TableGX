import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ColumnJumpDialog } from '../src/core/ColumnJumpDialog'
import type { ColumnJumpEntry } from '../src/types'

const entries: ColumnJumpEntry[] = [
  { columnId: 'name', label: 'Name', hidden: false },
  { columnId: 'city', label: 'City', hidden: true },
  { columnId: 'country', label: 'Country', hidden: false },
]

const foreignEntries: ColumnJumpEntry[] = [
  { columnId: 'name', label: 'Name', hidden: false },
  { columnId: 'total', label: 'Total', hidden: false, tabId: 'b', tabLabel: 'Tab B' },
]

function Harness({
  initialEntries,
  onSelect = () => {},
}: {
  initialEntries: ColumnJumpEntry[]
  onSelect?: (entry: ColumnJumpEntry) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <ColumnJumpDialog
      open={open}
      onOpenChange={setOpen}
      entries={initialEntries}
      onSelect={onSelect}
    />
  )
}

describe('ColumnJumpDialog', () => {
  it('lists every entry alphabetically when the query is empty', async () => {
    render(<Harness initialEntries={entries} />)
    const dialog = await screen.findByRole('dialog')
    const rows = within(dialog).getAllByRole('button')
    expect(rows.map((r) => r.textContent)).toEqual(['CityHidden', 'Country', 'Name'])
  })

  it('filters case-insensitively as the user types', async () => {
    const user = userEvent.setup()
    render(<Harness initialEntries={entries} />)
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'CO');
    expect(within(dialog).getByRole('button', { name: 'Country' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Name' })).not.toBeInTheDocument()
  })

  it('shows "No columns match" when nothing matches', async () => {
    const user = userEvent.setup()
    render(<Harness initialEntries={entries} />)
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'zzz')
    expect(within(dialog).getByText('No columns match')).toBeInTheDocument()
  })

  it('marks hidden entries', async () => {
    render(<Harness initialEntries={entries} />)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'CityHidden' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Country' })).toBeInTheDocument()
  })

  it('shows a tab badge only when entries span more than one tab', async () => {
    render(<Harness initialEntries={entries} />)
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText('Tab B')).not.toBeInTheDocument()

    render(<Harness initialEntries={foreignEntries} />)
    const dialogs = await screen.findAllByRole('dialog')
    dialog = dialogs[dialogs.length - 1]!
    expect(within(dialog).getByText('Tab B')).toBeInTheDocument()
  })

  it('Enter selects the highlighted entry and closes', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness initialEntries={entries} onSelect={onSelect} />)
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), '{Enter}')
    expect(onSelect).toHaveBeenCalledWith(entries[1]) // alphabetical: City is first
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ArrowDown moves the highlight before Enter selects', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness initialEntries={entries} onSelect={onSelect} />)
    const dialog = await screen.findByRole('dialog')
    const box = within(dialog).getByRole('textbox')
    await user.type(box, '{ArrowDown}{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(entries[0]) // City, Country, Name -> index 2 -> Name
  })

  it('clicking a row selects it directly', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness initialEntries={entries} onSelect={onSelect} />)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Country' }))
    expect(onSelect).toHaveBeenCalledWith(entries[2])
  })

  it('Escape closes without selecting', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness initialEntries={entries} onSelect={onSelect} />)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
