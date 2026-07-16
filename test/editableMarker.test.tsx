import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { EditableTable } from '../src/components/EditableTable'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn } from '../src/types'

type Row = { id: string; name: string; city: string }

const measure: MeasureTextFn = (text) => text.length * 8

const data: Row[] = [
  { id: '1', name: 'Ada', city: 'London' },
  { id: '2', name: 'Linus', city: 'Helsinki' },
]

const editableColumns = [
  textColumn<Row>('name', 'Name', { editable: true }),
  textColumn<Row>('city', 'City'),
]

/** The `data-tgx-table` root, which should carry `data-tgx-editable` per the marker rules. */
function tableRoot(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-tgx-table]')
  if (!el) throw new Error('no table root rendered')
  return el
}

describe('data-tgx-editable marker (TableCore root)', () => {
  it('is present when editable and at least one visible column is editable', () => {
    const { container } = render(
      <EditableTable<Row>
        data={data}
        columns={editableColumns}
        getRowId={(r) => r.id}
        editableColumnIds={['name']}
        onSaveEdit={async () => true}
        measure={measure}
      />,
    )
    expect(tableRoot(container)).toHaveAttribute('data-tgx-editable', '')
  })

  it('is absent when editable but zero columns are actually editable (editableColumnIds empty)', () => {
    const { container } = render(
      <EditableTable<Row>
        data={data}
        columns={editableColumns}
        getRowId={(r) => r.id}
        editableColumnIds={[]}
        onSaveEdit={async () => true}
        measure={measure}
      />,
    )
    expect(tableRoot(container)).not.toHaveAttribute('data-tgx-editable')
  })

  it('is absent when editable but no column declares meta.editable', () => {
    const nonEditableColumns = [textColumn<Row>('name', 'Name'), textColumn<Row>('city', 'City')]
    const { container } = render(
      <EditableTable<Row>
        data={data}
        columns={nonEditableColumns}
        getRowId={(r) => r.id}
        editableColumnIds={['name']}
        onSaveEdit={async () => true}
        measure={measure}
      />,
    )
    expect(tableRoot(container)).not.toHaveAttribute('data-tgx-editable')
  })

  it('is absent on a read-only table', () => {
    const { container } = render(
      <ReadOnlyTable<Row> data={data} columns={editableColumns} getRowId={(r) => r.id} measure={measure} />,
    )
    expect(tableRoot(container)).not.toHaveAttribute('data-tgx-editable')
    // Sanity: the base table marker is still there.
    expect(tableRoot(container)).toHaveAttribute('data-tgx-table', '')
  })

  it('disappears when the only editable column is hidden via the visibility picker, and reappears when re-shown', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <EditableTable<Row>
        data={data}
        columns={editableColumns}
        getRowId={(r) => r.id}
        editableColumnIds={['name']}
        onSaveEdit={async () => true}
        enableColumnVisibility
        measure={measure}
      />,
    )
    expect(tableRoot(container)).toHaveAttribute('data-tgx-editable', '')

    await user.click(screen.getByRole('button', { name: /Columns/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Name' }))

    await waitFor(() => expect(tableRoot(container)).not.toHaveAttribute('data-tgx-editable'))

    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Name' }))
    await waitFor(() => expect(tableRoot(container)).toHaveAttribute('data-tgx-editable', ''))
  })
})
