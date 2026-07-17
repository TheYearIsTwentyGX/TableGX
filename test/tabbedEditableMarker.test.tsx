import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TabbedTable } from '../src/components/TabbedTable'
import { IndependentTabbedTable, independentTable } from '../src/components/IndependentTabbedTable'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn, TabbedTableTab } from '../src/types'

type Row = { id: string; name: string; city: string }

const measure: MeasureTextFn = (text) => text.length * 8

const data: Row[] = [
  { id: '1', name: 'Ada', city: 'London' },
  { id: '2', name: 'Linus', city: 'Helsinki' },
]

/** The tabbed container root, shared by TabbedTable and IndependentTabbedTable. */
function containerRoot(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-tgx-tabbed-table]')
  if (!el) throw new Error('no tabbed container rendered')
  return el
}

describe('data-tgx-editable marker (TabbedTable container)', () => {
  it('is present when the active tab is read-only but a secondary tab is editable', () => {
    const tabs: TabbedTableTab<Row>[] = [
      { id: 'view', label: 'View', columns: [textColumn<Row>('name', 'Name')] },
      {
        id: 'edit',
        label: 'Edit',
        columns: [textColumn<Row>('name', 'Name', { editable: true })],
        editable: true,
        editableColumnIds: ['name'],
        onSaveEdit: async () => true,
      },
    ]
    const { container } = render(
      <TabbedTable<Row>
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabs}
        defaultTabId="view"
        measure={measure}
      />,
    )
    expect(containerRoot(container)).toHaveAttribute('data-tgx-editable', '')
  })

  it('is absent when every tab is read-only', () => {
    const tabs: TabbedTableTab<Row>[] = [
      { id: 'view', label: 'View', columns: [textColumn<Row>('name', 'Name')] },
      { id: 'view2', label: 'View 2', columns: [textColumn<Row>('city', 'City')] },
    ]
    const { container } = render(
      <TabbedTable<Row>
        data={data}
        getRowId={(r) => r.id}
        idColumn="id"
        tabs={tabs}
        defaultTabId="view"
        measure={measure}
      />,
    )
    expect(containerRoot(container)).not.toHaveAttribute('data-tgx-editable')
  })
})

describe('data-tgx-editable marker (IndependentTabbedTable container)', () => {
  it('is present when the active tab is read-only but a secondary tab is editable', () => {
    const tabs = [
      independentTable<Row>({
        id: 'view',
        label: 'View',
        data,
        getRowId: (r) => r.id,
        columns: [textColumn<Row>('name', 'Name')],
        measure,
      }),
      independentTable<Row>({
        id: 'edit',
        label: 'Edit',
        data,
        getRowId: (r) => r.id,
        columns: [textColumn<Row>('name', 'Name', { editable: true })],
        editable: true,
        editableColumnIds: ['name'],
        onSaveEdit: async () => true,
        measure,
      }),
    ]
    const { container } = render(
      <IndependentTabbedTable tabs={tabs} defaultTabId="view" measure={measure} />,
    )
    expect(containerRoot(container)).toHaveAttribute('data-tgx-editable', '')
  })

  it('is absent when every tab is read-only', () => {
    const tabs = [
      independentTable<Row>({
        id: 'view',
        label: 'View',
        data,
        getRowId: (r) => r.id,
        columns: [textColumn<Row>('name', 'Name')],
        measure,
      }),
      independentTable<Row>({
        id: 'view2',
        label: 'View 2',
        data,
        getRowId: (r) => r.id,
        columns: [textColumn<Row>('city', 'City')],
        measure,
      }),
    ]
    const { container } = render(
      <IndependentTabbedTable tabs={tabs} defaultTabId="view" measure={measure} />,
    )
    expect(containerRoot(container)).not.toHaveAttribute('data-tgx-editable')
  })
})
