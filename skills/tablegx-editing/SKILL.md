---
name: tablegx-editing
description: >-
  Inline editing with EditableTable: editableColumnIds, meta.editable, inputType
  (text|number|boolean|select), onSaveEdit return false to keep editor open,
  singleClickEdit, columnGroups, CellAction buttons, selectColumn/booleanColumn.
  Use when implementing editable grids, cell action buttons, or column meta.
type: core
library: tablegx
library_version: "2.0.0"
sources:
  - "TableGX:packages/tablegx/README.md"
  - "TableGX:packages/tablegx/src/types.ts"
  - "TableGX:packages/tablegx/src/lib/columns.tsx"
---

# @twentygx/tablegx — Editing & Columns

## Setup

```tsx
import {
  EditableTable,
  textColumn,
  numberColumn,
  booleanColumn,
  selectColumn,
} from '@twentygx/tablegx'

type Row = { id: string; dba: string; beds: number; isActive: boolean; state: string }

const STATE_OPTIONS = ['TX', 'CA', 'NY'].map((s) => ({ label: s, value: s }))

<EditableTable<Row>
  data={data}
  getRowId={(r) => r.id}
  editableColumnIds={['dba', 'beds', 'isActive', 'state']}
  onSaveEdit={async (row, columnId, value) => {
    const ok = await api.patch(row.id, { [columnId]: value })
    return ok
  }}
  singleClickEdit
  columns={[
    textColumn('dba', 'DBA', { editable: true, inputType: 'text' }),
    numberColumn('beds', 'Beds', { editable: true, inputType: 'number', footerAggregate: 'sum' }),
    booleanColumn('isActive', 'Active', { editable: true, inputType: 'boolean' }),
    selectColumn('state', 'State', STATE_OPTIONS, { editable: true }),
  ]}
/>
```

## Core Patterns

### TableColumnMeta (via column `meta`)

| Key | Purpose |
| --- | ------- |
| `editable`, `inputType`, `selectOptions` | Inline editing |
| `measureText(row)` | Auto-width string for custom/non-text cells |
| `fixedMeasureWidth` | Fixed px width (icon/action columns) |
| `maxColumnWidth` | Per-column auto-size clamp |
| `footerAggregate`, `footerFormat`, `footerLabel` | Footer row |
| `actions` | Declarative cell action buttons |

Module augmentation: `ColumnMeta` extends `TableColumnMeta`.

### Cell actions

```tsx
{
  id: 'actions',
  header: '',
  enableSorting: false,
  enableColumnFilter: false,
  meta: {
    fixedMeasureWidth: 96,
    actions: [
      {
        id: 'delete',
        icon: <TrashIcon />,
        ariaLabel: 'Delete',
        variant: 'destructive',
        confirm: { title: 'Delete row?', confirmLabel: 'Delete' },
        onClick: async (row) => { await api.delete(row.id) },
        isHidden: (row) => row.isLocked,
        isDisabled: (row) => !row.canDelete,
      },
    ],
  },
}
```

Clicks stop propagation before `onClick`. Icon-only buttons require `ariaLabel`.

### Edit keyboard / commit

- **Enter** commits (Shift+Enter newline in text)
- **Escape** cancels
- **blur** commits
- **Tab / Shift+Tab** commits and moves to adjacent editable cell
- `singleClickEdit`: boolean cells use interactive checkboxes directly

### Column factories

`textColumn`, `numberColumn`, `booleanColumn`, `selectColumn`, `dateColumn`, `badgeColumn` — each enables filtering with `tgxFilterFn` by default.

## Common Mistakes

### CRITICAL meta.editable without editableColumnIds whitelist

Wrong:

```tsx
columns={[textColumn('name', 'Name', { editable: true })]}
<EditableTable data={data} columns={columns} onSaveEdit={save} editableColumnIds={[]} />
```

Correct:

```tsx
<EditableTable
  editableColumnIds={['name']}
  columns={[textColumn('name', 'Name', { editable: true, inputType: 'text' })]}
  onSaveEdit={save}
/>
```

Both `meta.editable: true` **and** `editableColumnIds` must include the column id.

Source: packages/tablegx/README.md

### HIGH onSaveEdit swallows errors

Wrong:

```tsx
onSaveEdit={async () => {
  await api.patch(...).catch(console.error)
  return true
}}
```

Correct:

```tsx
onSaveEdit={async (row, col, val) => {
  try {
    await api.patch(row.id, { [col]: val })
    return true
  } catch {
    return false
  }
}}
```

Returning `false` keeps the editor open for retry.

Source: packages/tablegx/src/types.ts

### HIGH Custom render without width hints

Wrong:

```tsx
{
  id: 'status',
  cell: ({ getValue }) => <Badge>{String(getValue())}</Badge>,
}
```

Correct:

```tsx
badgeColumn('status', 'Status')
// or meta: { measureText: (row) => String(row.status) }
// or meta: { fixedMeasureWidth: 80 } for icon columns
```

Auto column widths use pre-paint text measurement; custom cells need `measureText` or `fixedMeasureWidth`.

Source: packages/tablegx/README.md

See also: tablegx-advanced/SKILL.md — editable TabbedTable tabs
