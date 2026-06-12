import { useMemo, useState } from 'react'
import {
  badgeColumn,
  CellOverflowList,
  customColumn,
  dateColumn,
  numberColumn,
  selectColumn,
  TabbedTable,
  textColumn,
  type ColumnDef,
  type TabbedTableTab,
} from 'tablegx'
import { makePeople, ROLE_OPTIONS, STATUS_OPTIONS, type Person } from '../data'
import { Pill, Section, Toggle } from '../ui'

export function TabbedExample() {
  const [rows, setRows] = useState<Person[]>(() => makePeople(120))
  const [selectable, setSelectable] = useState(true)
  const [selected, setSelected] = useState<string[]>([])

  const overviewColumns = useMemo<ColumnDef<Person, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      badgeColumn('role', 'Role'),
      // Custom overflow cell — the same renderCell + CellOverflowList primitive
      // works unchanged on TabbedTable via the shared BodyCell.
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
      selectColumn('status', 'Status', STATUS_OPTIONS),
      dateColumn('startDate', 'Start date'),
    ],
    [],
  )

  const compensationColumns = useMemo<ColumnDef<Person, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      numberColumn('salary', 'Salary', {
        editable: true,
        footerAggregate: 'avg',
        footerLabel: 'Avg ',
        footerFormat: (v) => `$${Math.round(v).toLocaleString()}`,
      }),
      selectColumn('department', 'Department', [
        { label: 'Platform', value: 'Platform' },
        { label: 'Growth', value: 'Growth' },
        { label: 'Design', value: 'Design' },
        { label: 'Finance', value: 'Finance' },
        { label: 'People', value: 'People' },
      ]),
    ],
    [],
  )

  const contactColumns = useMemo<ColumnDef<Person, unknown>[]>(
    () => [
      textColumn('name', 'Name'),
      textColumn('email', 'Email'),
      selectColumn('role', 'Role', ROLE_OPTIONS),
    ],
    [],
  )

  const tabs = useMemo<TabbedTableTab<Person>[]>(
    () => [
      {
        id: 'overview',
        label: 'Overview',
        columns: overviewColumns,
        frozenColumns: 1,
        initialSorting: [{ id: 'name', desc: false }],
      },
      {
        id: 'compensation',
        label: 'Compensation',
        columns: compensationColumns,
        frozenColumns: 1,
        editable: true,
        editableColumnIds: ['salary'],
        onSaveEdit: async (row, columnId, value) => {
          setRows((prev) =>
            prev.map((r) => (r.id === row.id ? { ...r, [columnId]: value } : r)),
          )
          return true
        },
      },
      {
        id: 'contact',
        label: 'Contact',
        columns: contactColumns,
      },
    ],
    [overviewColumns, compensationColumns, contactColumns],
  )

  return (
    <Section
      title="TabbedTable"
      description="Multiple views over one dataset with shared selection, cross-tab filter intersection, fully-shared sorting (sorting by any column — even one only one tab shows, like Salary or Email — reorders the rows on every tab), and a sliding tab strip. The Compensation tab is inline-editable."
      controls={
        <>
          <Toggle label="Row selection" checked={selectable} onChange={setSelectable} />
          {selectable && (
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
          )}
        </>
      }
    >
      <div className="flex h-[460px] flex-col">
        <TabbedTable<Person>
          data={rows}
          getRowId={(r) => r.id}
          idColumn="id"
          tabs={tabs}
          enableFooter
          enableColumnVisibility
          enableMultiSort
          enableSortHierarchy
          enableRowSelection={selectable}
          selectedRowIds={selected}
          onSelectedRowIdsChange={setSelected}
        />
      </div>
    </Section>
  )
}
