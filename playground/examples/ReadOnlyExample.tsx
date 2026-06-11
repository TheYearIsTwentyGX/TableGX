import { useMemo, useState } from 'react'
import {
  badgeColumn,
  dateColumn,
  numberColumn,
  ReadOnlyTable,
  selectColumn,
  textColumn,
  type ColumnDef,
} from 'tablegx'
import { people, type Person } from '../data'
import { Section, Toggle } from '../ui'

export function ReadOnlyExample() {
  const [loading, setLoading] = useState(false)
  const [footer, setFooter] = useState(true)
  const [frozen, setFrozen] = useState(true)
  const [selectable, setSelectable] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  const columns = useMemo<ColumnDef<Person, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      textColumn('email', 'Email'),
      badgeColumn('role', 'Role'),
      selectColumn('department', 'Department', [
        { label: 'Platform', value: 'Platform' },
        { label: 'Growth', value: 'Growth' },
        { label: 'Design', value: 'Design' },
        { label: 'Finance', value: 'Finance' },
        { label: 'People', value: 'People' },
      ]),
      numberColumn('salary', 'Salary', {
        footerAggregate: 'avg',
        footerLabel: 'Avg ',
        footerFormat: (v) => `$${Math.round(v).toLocaleString()}`,
      }),
      dateColumn('startDate', 'Start date'),
    ],
    [],
  )

  return (
    <Section
      title="ReadOnlyTable"
      description="Virtualized display grid. Sort by clicking headers, filter from the header menus, and scroll 200 rows."
      controls={
        <>
          <Toggle label="Loading skeleton" checked={loading} onChange={setLoading} />
          <Toggle label="Footer aggregates" checked={footer} onChange={setFooter} />
          <Toggle label="Frozen first column" checked={frozen} onChange={setFrozen} />
          <Toggle label="Row selection" checked={selectable} onChange={setSelectable} />
          {selectable && (
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
          )}
        </>
      }
    >
      <div className="flex h-[420px] flex-col">
        <ReadOnlyTable<Person>
          data={people}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={loading}
          enableFooter={footer}
          frozenColumns={frozen ? 1 : 0}
          enableColumnVisibility
          enableRowSelection={selectable}
          selectedRowIds={selected}
          onSelectedRowIdsChange={setSelected}
          initialSorting={[{ id: 'name', desc: false }]}
        />
      </div>
    </Section>
  )
}
