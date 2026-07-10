import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EditableTable } from '../src/components/EditableTable'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn } from '../src/types'

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
