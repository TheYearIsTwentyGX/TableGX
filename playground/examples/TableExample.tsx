import { useMemo, useState } from 'react'
import {
  booleanColumn,
  CellOverflowList,
  customColumn,
  dateColumn,
  numberColumn,
  selectColumn,
  TableGX,
  textColumn,
  type CellAction,
  type ColumnDef,
} from 'tablegx'
import {
  DEPARTMENT_OPTIONS,
  makePeople,
  ROLE_OPTIONS,
  skillPool,
  STATUS_OPTIONS,
  type Person,
} from '../data'
import { Pill, PopoverPanel, Section, Toggle } from '../ui'

export function TableExample() {
  const [rows, setRows] = useState<Person[]>(() => makePeople(120))
  const [editable, setEditable] = useState(false)
  const [singleClick, setSingleClick] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectable, setSelectable] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [lastEvent, setLastEvent] = useState('Toggle "Editable" and edit a cell…')
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

  // One column set serves both modes. The `editable: true` flags only take
  // effect while the `editable` prop below is on; with it off the same table is
  // a plain read-only grid.
  const columns = useMemo<ColumnDef<Person, unknown>[]>(
    () => [
      textColumn('name', 'Name', { editable: true }),
      textColumn('email', 'Email'),
      selectColumn('role', 'Role', ROLE_OPTIONS, { editable: true }),
      selectColumn('department', 'Department', DEPARTMENT_OPTIONS),
      selectColumn('status', 'Status', STATUS_OPTIONS, { editable: true }),
      numberColumn('salary', 'Salary', {
        editable: true,
        footerAggregate: 'avg',
        footerLabel: 'Avg ',
        footerFormat: (v) => `$${Math.round(v).toLocaleString()}`,
      }),
      dateColumn('startDate', 'Start date'),
      booleanColumn('active', 'Active', { editable: true }),
      // Custom, non-truncating cell: inline tags collapsing extras into "+N".
      // Each tag's ✕ removes it (isolated from edit/selection); clicking empty
      // space opens a popover to add skills.
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
          measureText: (row) => ((row.skills as string[]) ?? []).join('  '),
          onCellClick: (ctx, event) =>
            setAdding({ id: String(ctx.row.id), x: event.clientX, y: event.clientY }),
        },
      ),
      // A rendered (JSX) header over a column with no values at all — the shape
      // that used to collapse to an icon-only stub, because auto-sizing had no
      // header string to measure and no cell content to fall back on. Its width
      // now comes from the label painted in the header.
      {
        id: 'reviewer',
        header: () => <span className="whitespace-normal leading-tight">Pending reviewer</span>,
        accessorFn: () => '',
        enableColumnFilter: true,
        cell: () => null,
      } as ColumnDef<Person, unknown>,
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
      title="Table — read-only ↔ editable"
      description="One TableGX table whose `editable` boolean flips inline editing on and off live. Flipping it does NOT remount the table, so your scroll position and row selection are preserved — scroll down, select a few rows, then toggle Editable on/off and watch your place stay put. When editable, double-click (or single-click when toggled) a cell to edit; the delete action confirms first; in Skills, ✕ removes a tag and clicking empty space adds one."
      controls={
        <>
          <Toggle label="Editable" checked={editable} onChange={setEditable} />
          <Toggle label="Single-click edit" checked={singleClick} onChange={setSingleClick} />
          <Toggle label="Row selection" checked={selectable} onChange={setSelectable} />
          <Toggle label="Loading skeleton" checked={loading} onChange={setLoading} />
          {selectable && (
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
          )}
          <span className="text-xs text-muted-foreground">{lastEvent}</span>
        </>
      }
    >
      <div className="flex h-[420px] flex-col">
        <TableGX<Person>
          variant="table"
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          editable={editable}
          editableColumnIds={['name', 'role', 'status', 'salary', 'active']}
          singleClickEdit={singleClick}
          isLoading={loading}
          enableFooter
          frozenColumns={1}
          enableColumnVisibility
          enableColumnJump
          enableRowSelection={selectable}
          selectedRowIds={selected}
          onSelectedRowIdsChange={setSelected}
          initialSorting={[{ id: 'name', desc: false }]}
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
