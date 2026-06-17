import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn } from '../src/types'

type Row = { id: string; name: string; city: string }

const measure: MeasureTextFn = (text) => text.length * 8

const columns = [textColumn<Row>('name', 'Name'), textColumn<Row>('city', 'City')]

// jsdom reports zero-sized elements, so the virtualizer (which reads
// offset/client sizes) renders nothing. Give elements a size for the duration
// of `fn`, then restore the original descriptors.
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

/** The body pinned (frozen) pane of the first rendered row. */
function pinnedPane(container: HTMLElement): HTMLElement {
  const row = container.querySelector<HTMLElement>('[data-tgx-row]')
  if (!row) throw new Error('no body row rendered')
  const pane = row.querySelector<HTMLElement>('[data-tgx-pinned]')
  if (!pane) throw new Error('no pinned pane rendered')
  return pane
}

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

  it('renders a custom loading skeleton instead of the default when provided', () => {
    const { container } = render(
      <ReadOnlyTable<Row>
        data={[]}
        columns={columns}
        getRowId={(r) => r.id}
        isLoading
        loadingSkeleton={<div data-testid="custom-skeleton">Loading…</div>}
        measure={measure}
      />,
    )
    expect(screen.getByTestId('custom-skeleton')).toBeInTheDocument()
    expect(container.querySelector('[data-tgx-skeleton]')).not.toBeInTheDocument()
  })

  it('passes the computed column widths to a custom skeleton render function', () => {
    let receivedWidths: number[] | undefined
    render(
      <ReadOnlyTable<Row>
        data={[]}
        columns={columns}
        getRowId={(r) => r.id}
        isLoading
        loadingSkeleton={(widths) => {
          receivedWidths = widths
          return <div data-testid="custom-skeleton-fn">Loading…</div>
        }}
        measure={measure}
      />,
    )
    expect(screen.getByTestId('custom-skeleton-fn')).toBeInTheDocument()
    expect(Array.isArray(receivedWidths)).toBe(true)
    expect(receivedWidths?.length).toBe(columns.length)
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
    await withElementSize(async () => {
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
    })
  })

  it('hides and restores a frozen column without promoting a scroll column', async () => {
    await withElementSize(async () => {
      type WideRow = { id: string } & Record<string, string>
      // 8 columns; the first two (col0, col1) are frozen.
      const cols = Array.from({ length: 8 }, (_, i) =>
        textColumn<WideRow>(`col${i}`, `Col ${i}`),
      )
      const row = Object.fromEntries([
        ['id', '1'],
        ...Array.from({ length: 8 }, (_, i) => [`col${i}`, `val${i}`]),
      ]) as WideRow

      const user = userEvent.setup()
      const { container } = render(
        <ReadOnlyTable<WideRow>
          data={[row]}
          columns={cols}
          getRowId={(r) => r.id}
          frozenColumns={2}
          enableColumnVisibility
          measure={measure}
        />,
      )

      await screen.findByText('val0')

      // The frozen pane holds the two frozen columns; col2 (scrollable) is not
      // in it.
      expect(within(pinnedPane(container)).getByText('val0')).toBeInTheDocument()
      expect(within(pinnedPane(container)).getByText('val1')).toBeInTheDocument()
      expect(within(pinnedPane(container)).queryByText('val2')).not.toBeInTheDocument()

      // Frozen columns are now listed in the picker.
      await user.click(screen.getByRole('button', { name: /Columns/ }))
      const col0Item = await screen.findByRole('menuitemcheckbox', { name: 'Col 0' })
      expect(col0Item).toBeInTheDocument()

      // Hide the frozen Col 0 — the pane shrinks and no scroll column is pulled
      // in to replace it.
      await user.click(col0Item)
      await waitFor(() =>
        expect(within(pinnedPane(container)).queryByText('val0')).not.toBeInTheDocument(),
      )
      expect(within(pinnedPane(container)).getByText('val1')).toBeInTheDocument()
      expect(within(pinnedPane(container)).queryByText('val2')).not.toBeInTheDocument()

      // Re-show Col 0 — it returns to its original first position in the pane.
      await user.click(screen.getByRole('menuitemcheckbox', { name: 'Col 0' }))
      await waitFor(() =>
        expect(within(pinnedPane(container)).getByText('val0')).toBeInTheDocument(),
      )
      const pinnedText = pinnedPane(container).textContent ?? ''
      expect(pinnedText.indexOf('val0')).toBeLessThan(pinnedText.indexOf('val1'))
      expect(within(pinnedPane(container)).queryByText('val2')).not.toBeInTheDocument()
    })
  })
})

describe('ReadOnlyTable column picker show-all / hide-all', () => {
  type PRow = { id: string; code: string; name: string; city: string }

  const pData: PRow[] = [
    { id: '1', code: 'C1', name: 'Bravo', city: 'York' },
    { id: '2', code: 'C2', name: 'Alpha', city: 'Zurich' },
  ]

  // `code` is locked (enableHiding: false); name and city are hideable.
  const pColumns = [
    { ...textColumn<PRow>('code', 'Code'), enableHiding: false },
    textColumn<PRow>('name', 'Name'),
    textColumn<PRow>('city', 'City'),
  ]

  it('reveals/hides every hideable column with correct extreme states, leaving locked columns untouched', async () => {
    await withElementSize(async () => {
      const user = userEvent.setup()
      render(
        <ReadOnlyTable<PRow>
          data={pData}
          columns={pColumns}
          getRowId={(r) => r.id}
          enableColumnVisibility
          measure={measure}
        />,
      )

      // All three columns render initially.
      expect(await screen.findByText('Bravo')).toBeInTheDocument()
      expect(screen.getByText('York')).toBeInTheDocument()
      expect(screen.getByText('C1')).toBeInTheDocument()

      // Open the picker. Everything visible → "Show all" disabled, "Hide all" enabled.
      await user.click(screen.getByRole('button', { name: /Columns/ }))
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
        expect(screen.queryByText('Bravo')).not.toBeInTheDocument()
        expect(screen.queryByText('York')).not.toBeInTheDocument()
      })
      // The locked Code column is untouched.
      expect(screen.getByText('C1')).toBeInTheDocument()

      // Now everything hidden → "Hide all" disabled, "Show all" enabled.
      expect(screen.getByRole('button', { name: 'Hide all' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Show all' })).toBeEnabled()

      // Show all reveals the hideable columns again.
      await user.click(screen.getByRole('button', { name: 'Show all' }))
      await waitFor(() => {
        expect(screen.queryByText('Bravo')).toBeInTheDocument()
        expect(screen.queryByText('York')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: 'Show all' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Hide all' })).toBeEnabled()
    })
  })
})
