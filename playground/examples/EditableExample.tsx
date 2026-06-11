import { useMemo, useState } from 'react'
import {
  booleanColumn,
  EditableTable,
  numberColumn,
  selectColumn,
  textColumn,
  type CellAction,
  type ColumnDef,
} from 'tablegx'
import { makePeople, ROLE_OPTIONS, STATUS_OPTIONS, type Person } from '../data'
import { Section, Toggle } from '../ui'

export function EditableExample() {
  const [rows, setRows] = useState<Person[]>(() => makePeople(40))
  const [singleClick, setSingleClick] = useState(false)
  const [lastEvent, setLastEvent] = useState('Edit a cell or use a row action…')

  const deleteAction: CellAction<Person> = {
    id: 'delete',
    label: 'Delete',
    variant: 'destructive',
    confirm: {
      title: 'Delete this person?',
      description: 'This removes the row from the table. It cannot be undone.',
      confirmLabel: 'Delete',
    },
    onClick: (row) => {
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      setLastEvent(`Deleted ${row.name}`)
    },
  }

  const columns = useMemo<ColumnDef<Person, unknown>[]>(
    () => [
      textColumn('name', 'Name', { editable: true }),
      selectColumn('role', 'Role', ROLE_OPTIONS, { editable: true }),
      selectColumn('status', 'Status', STATUS_OPTIONS, { editable: true }),
      numberColumn('salary', 'Salary', {
        editable: true,
        footerAggregate: 'sum',
        footerLabel: 'Total ',
        footerFormat: (v) => `$${Math.round(v).toLocaleString()}`,
      }),
      booleanColumn('active', 'Active', { editable: true }),
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        enableColumnFilter: false,
        cell: () => null,
        meta: { actions: [deleteAction as unknown as CellAction<Record<string, unknown>>] },
      } as ColumnDef<Person, unknown>,
    ],
    // deleteAction closes over setState only; safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <Section
      title="EditableTable"
      description="Inline editing with optimistic commit. Double-click (or single-click when toggled) a cell to edit; the delete action shows a confirm dialog."
      controls={
        <>
          <Toggle label="Single-click edit" checked={singleClick} onChange={setSingleClick} />
          <span className="text-xs text-muted-foreground">{lastEvent}</span>
        </>
      }
    >
      <div className="flex h-[420px] flex-col">
        <EditableTable<Person>
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          editableColumnIds={['name', 'role', 'status', 'salary', 'active']}
          singleClickEdit={singleClick}
          enableFooter
          frozenColumns={1}
          onSaveEdit={async (row, columnId, value) => {
            setRows((prev) =>
              prev.map((r) => (r.id === row.id ? { ...r, [columnId]: value } : r)),
            )
            setLastEvent(`Saved ${columnId} = ${String(value)} for ${row.name}`)
            return true
          }}
        />
      </div>
    </Section>
  )
}
