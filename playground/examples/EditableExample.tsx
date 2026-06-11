import { useMemo, useState } from 'react'
import {
  booleanColumn,
  CellOverflowList,
  customColumn,
  EditableTable,
  numberColumn,
  selectColumn,
  textColumn,
  type CellAction,
  type ColumnDef,
} from 'tablegx'
import { makePeople, ROLE_OPTIONS, skillPool, STATUS_OPTIONS, type Person } from '../data'
import { Pill, PopoverPanel, Section, Toggle } from '../ui'

export function EditableExample() {
  const [rows, setRows] = useState<Person[]>(() => makePeople(40))
  const [singleClick, setSingleClick] = useState(false)
  const [lastEvent, setLastEvent] = useState('Edit a cell or use a row action…')
  // Open state for the "add skill" popover, anchored at the click coordinates
  // surfaced by the Skills cell's `onCellClick`.
  const [adding, setAdding] = useState<{ id: string; x: number; y: number } | null>(null)

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
      // Custom cell with interactive children. Each tag's ✕ uses
      // `cellInteractionProps` (via Pill) so removing a tag does NOT trigger
      // the cell's own `onCellClick` or enter inline edit. Clicking empty space
      // in the cell fires onCellClick, which opens an "add skill" popover.
      customColumn<Person>(
        'skills',
        'Skills',
        ({ row }) => {
          const person = row as Person
          return (
            <CellOverflowList>
              {person.skills.map((s) => (
                <Pill
                  key={s}
                  onRemove={() => {
                    setRows((prev) =>
                      prev.map((r) =>
                        r.id === person.id
                          ? { ...r, skills: r.skills.filter((x) => x !== s) }
                          : r,
                      ),
                    )
                    setLastEvent(`Removed ${s} from ${person.name}`)
                  }}
                >
                  {s}
                </Pill>
              ))}
            </CellOverflowList>
          )
        },
        {
          maxColumnWidth: 240,
          onCellClick: (ctx, event) =>
            setAdding({ id: String(ctx.row.id), x: event.clientX, y: event.clientY }),
        },
      ),
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

  const addingPerson = adding ? rows.find((r) => r.id === adding.id) : undefined
  const available = addingPerson
    ? skillPool.filter((s) => !addingPerson.skills.includes(s))
    : []

  return (
    <Section
      title="EditableTable"
      description="Inline editing with optimistic commit. Double-click (or single-click when toggled) a cell to edit; the delete action shows a confirm dialog. In the Skills cell, the ✕ removes a tag (isolated from edit) and clicking empty space opens a popover to add skills."
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
      {adding && addingPerson && (
        <PopoverPanel x={adding.x} y={adding.y} onClose={() => setAdding(null)}>
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Add a skill to {addingPerson.name}
          </div>
          {available.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">All skills added</div>
          ) : (
            available.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === addingPerson.id ? { ...r, skills: [...r.skills, s] } : r,
                    ),
                  )
                  setLastEvent(`Added ${s} to ${addingPerson.name}`)
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              >
                {s}
              </button>
            ))
          )}
        </PopoverPanel>
      )}
    </Section>
  )
}
