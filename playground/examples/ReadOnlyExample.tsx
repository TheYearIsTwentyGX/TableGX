import { useMemo, useState } from 'react'
import {
  badgeColumn,
  CellOverflowList,
  customColumn,
  dateColumn,
  numberColumn,
  ReadOnlyTable,
  selectColumn,
  textColumn,
  type ColumnDef,
} from 'tablegx'
import { people, STATUS_OPTIONS, type Person } from '../data'
import { Pill, Section, Toggle } from '../ui'

export function ReadOnlyExample() {
  const [loading, setLoading] = useState(true)
  const [footer, setFooter] = useState(true)
  const [frozen, setFrozen] = useState(true)
  const [selectable, setSelectable] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [clicked, setClicked] = useState<string | null>(null)
  // Default true: header label + sort/filter icons floor each column's width.
  // Toggle off to size columns purely from data — long headers then clip and
  // their icons fall back to an overlay (see the narrow "Status" column).
  const [headerFloor, setHeaderFloor] = useState(true)

  const columns = useMemo<ColumnDef<Person, unknown>[]>(
    () => [
      // `meta.onCellClick` makes the whole Name cell clickable. The click is
      // isolated from row selection (toggle it on to verify the row doesn't
      // select when you click the name).
      textColumn('name', 'Name', {
        onCellClick: (ctx) => setClicked(String(ctx.value)),
      }),
      textColumn('email', 'Email'),
      badgeColumn('role', 'Role'),
      // Custom, non-truncating cell: multiple inline tags laid out side by side
      // via `customColumn` + `CellOverflowList`, collapsing extras into "+N".
      customColumn<Person>(
        'skills',
        'Skills',
        ({ value }) => (
          <CellOverflowList>
            {((value as string[]) ?? []).map((s) => (
              <Pill key={s}>{s}</Pill>
            ))}
          </CellOverflowList>
        ),
        {
          measureText: (row) => ((row.skills as string[]) ?? []).join('  '),
          maxColumnWidth: 240,
        },
      ),
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
      // Deliberately narrow column: a small `maxColumnWidth` clamps the width
      // below the header label + its sort/filter icons. With the header width
      // floor on (default) the floor wins and the column stays wide; turn the
      // floor off and this clamp takes effect, so the icons overlay the text.
      selectColumn('status', 'Status', STATUS_OPTIONS, { maxColumnWidth: 56 }),
    ],
    [],
  )

  return (
    <Section
      title="ReadOnlyTable"
      description="Virtualized display grid. The Skills column is a custom, non-truncating cell that collapses extra tags into a '+N'. Click a Name to fire its onCellClick — isolated from row selection. Toggle the header width floor to watch columns resize from data alone — the narrow Status column then shows the sort/filter icon overlay."
      controls={
        <>
          <Toggle label="Loading skeleton" checked={loading} onChange={setLoading} />
          <Toggle label="Footer aggregates" checked={footer} onChange={setFooter} />
          <Toggle label="Frozen first column" checked={frozen} onChange={setFrozen} />
          <Toggle label="Header width floor" checked={headerFloor} onChange={setHeaderFloor} />
          <Toggle label="Row selection" checked={selectable} onChange={setSelectable} />
          {selectable && (
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
          )}
          <span className="text-xs text-muted-foreground">
            {clicked ? `Clicked: ${clicked}` : 'Click a name…'}
          </span>
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
          includeHeaderInAutosize={headerFloor}
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
