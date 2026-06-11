import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn } from '../src/types'

type Row = { id: string; name: string; city: string }

const measure: MeasureTextFn = (text) => text.length * 8

const columns = [textColumn<Row>('name', 'Name'), textColumn<Row>('city', 'City')]

describe('ReadOnlyTable (smoke)', () => {
  it('renders headers and the empty message when there are no rows', () => {
    render(
      <ReadOnlyTable<Row>
        data={[]}
        columns={columns}
        getRowId={(r) => r.id}
        maxHeight="400px"
        measure={measure}
      />,
    )
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('City')).toBeInTheDocument()
    expect(screen.getByText('No results found')).toBeInTheDocument()
  })

  it('renders a custom empty message', () => {
    render(
      <ReadOnlyTable<Row>
        data={[]}
        columns={columns}
        getRowId={(r) => r.id}
        emptyMessage="Nothing here"
        measure={measure}
      />,
    )
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('renders the loading skeleton instead of the grid', () => {
    const { container } = render(
      <ReadOnlyTable<Row>
        data={[]}
        columns={columns}
        getRowId={(r) => r.id}
        isLoading
        measure={measure}
      />,
    )
    expect(container.querySelector('[data-tgx-skeleton]')).toBeInTheDocument()
    expect(screen.queryByText('No results found')).not.toBeInTheDocument()
  })

  it('renders the select-all checkbox with an aria-label when selection is enabled', () => {
    render(
      <ReadOnlyTable<Row>
        data={[{ id: '1', name: 'A', city: 'X' }]}
        columns={columns}
        getRowId={(r) => r.id}
        enableRowSelection
        measure={measure}
      />,
    )
    expect(screen.getByLabelText('Select all rows')).toBeInTheDocument()
  })

  it('hides and restores body cells when column visibility is toggled', async () => {
    // jsdom reports zero-sized elements, so the row virtualizer (which reads
    // offsetWidth/offsetHeight) would render nothing; give elements a size.
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
      // A wide table, so the column-virtualization window is capped by the
      // viewport: hiding one column then leaves the virtual range indices
      // unchanged, which is exactly the case where the memoized rows used to
      // skip re-rendering (narrow tables invalidate via the range shrinking).
      type WideRow = { id: string } & Record<string, string>
      const wideColumns = Array.from({ length: 30 }, (_, i) =>
        textColumn<WideRow>(`col${i}`, `Col ${i}`),
      )
      const wideRow = Object.fromEntries([
        ['id', '1'],
        ...Array.from({ length: 30 }, (_, i) => [`col${i}`, `val${i}`]),
      ]) as WideRow

      const user = userEvent.setup()
      render(
        <ReadOnlyTable<WideRow>
          data={[wideRow]}
          columns={wideColumns}
          getRowId={(r) => r.id}
          enableColumnVisibility
          measure={measure}
        />,
      )

      // Body cells in the virtual window render initially.
      expect(await screen.findByText('val0')).toBeInTheDocument()
      expect(screen.getByText('val2')).toBeInTheDocument()

      // Hide Col 2 via the picker — the memoized body rows must re-render,
      // not just the header.
      await user.click(screen.getByRole('button', { name: /Columns/ }))
      await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Col 2' }))
      await waitFor(() => expect(screen.queryByText('val2')).not.toBeInTheDocument())
      expect(screen.getByText('val0')).toBeInTheDocument()

      // Toggle it back on.
      await user.click(screen.getByRole('menuitemcheckbox', { name: 'Col 2' }))
      await waitFor(() => expect(screen.getByText('val2')).toBeInTheDocument())
    } finally {
      for (const k of Object.keys(sizeProps)) {
        const orig = originals[k]
        if (orig) Object.defineProperty(HTMLElement.prototype, k, orig)
        else Reflect.deleteProperty(HTMLElement.prototype, k)
      }
    }
  })
})
