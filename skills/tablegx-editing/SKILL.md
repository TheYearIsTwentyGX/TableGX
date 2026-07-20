---
name: tablegx-editing
description: >-
  Inline editing with EditableTable: editableColumnIds, meta.editable, inputType
  (text|number|boolean|select), onSaveEdit return false to keep editor open,
  singleClickEdit, columnGroups, CellAction buttons, selectColumn/booleanColumn.
  Use when implementing editable grids, cell action buttons, or column meta.
type: core
library: tablegx
library_version: "3.3.0"
sources:
  - "README.md"
  - "src/types.ts"
  - "src/lib/columns.tsx"
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
| `measureWidth(row)` | Exact per-row content width (px) when width isn't a function of any text (sparkline, chips, image grid); takes precedence over the other two |
| `maxColumnWidth` | Per-column auto-size clamp |
| `footerAggregate`, `footerFormat`, `footerLabel` | Footer row |
| `actions` | Declarative cell action buttons (or custom-rendered controls) |
| `renderCell(ctx)` | Full control of cell content (non-truncating, flexible) |
| `onCellClick(ctx, e)` | Make the whole cell clickable, isolated from selection/expand/edit |
| `disableTruncate` | Opt the value area out of single-line truncation |
| `searchable` | Set `false` to exclude the column from the built-in global search (`enableGlobalSearch`); see tablegx-advanced |

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

For anything the declarative button can't express (popover triggers, menus), use a custom action — `{ id, render: (row) => <Control /> }` in the same `actions` array. The slot click-isolates the control automatically (no selection/expand/edit leak).

### Edit keyboard / commit

- **Enter** commits (Shift+Enter newline in text)
- **Escape** cancels
- **blur** commits
- **Tab / Shift+Tab** commits and moves to adjacent editable cell
- `singleClickEdit`: boolean cells use interactive checkboxes directly

### Detecting editability from outside the table

`[data-tgx-editable]` reflects **effective, per-user editability**, not just the `editable` prop. On a single table it's present only when `editable` is true AND at least one currently-visible column is actually editable — the same gating cells use, so a column that's nominally editable but excluded by `editableColumnIds` or hidden via the visibility picker doesn't count. On `TabbedTable`/`IndependentTabbedTable` the attribute lives on the tabbed container and is present if **any** tab is editable, even while the active tab is read-only. Use `document.querySelector('[data-tgx-editable]')` (or plain CSS) to detect "this user can edit something here" without threading editability state through your own app.

Source: README.md

### Row height

`rowHeight` (`number | 'auto' | (row) => number`, default fixed 56px) is a shared table prop that applies to `EditableTable` too. Use `'auto'` when edited values need to wrap to multiple lines (cells top-align and wrap, with 56px as the floor); a number or `(row) => number` sets explicit per-row heights with no measurement. See tablegx-advanced/SKILL.md → Row height for the full behavior and virtualization tradeoffs.

Source: src/types.ts

### Column factories

`textColumn`, `numberColumn`, `booleanColumn`, `selectColumn`, `dateColumn`, `badgeColumn`, `customColumn` — each enables filtering with `tgxFilterFn` by default.

### Custom cell rendering

`customColumn(id, header, render, meta?)` (or `meta.renderCell`) takes a typed `CellRenderContext` (`{ row, value, columnId, column, table, isEditing }`) and renders into a non-truncating, horizontally-flexible container — multiple badges, wrapping content, or interactive controls sit side by side instead of being clipped:

```tsx
import { customColumn, CellOverflowList, cellInteractionProps } from '@twentygx/tablegx'

customColumn<Row>('tags', 'Tags', ({ row }) => (
  <CellOverflowList>
    {row.tags.map((t) => <Badge key={t}>{t}</Badge>)}
  </CellOverflowList>
), { measureText: (row) => row.tags.join(' ') })
```

- Custom content has no inferable text — always pair with `measureText` / `fixedMeasureWidth` for auto-sizing.
- `CellOverflowList` shows as many inline items as fit, collapsing the rest into a `+N` pill (DOM-measured, re-measures on resize).
- For interactive children inside a custom cell, spread `cellInteractionProps` (or call `isolateCellEvent`) so their clicks don't trigger selection/expand/edit.
- `meta.onCellClick(ctx, e)` makes the whole cell clickable; on an editable column it does NOT also auto-enter edit.

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

Source: README.md

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

Source: src/types.ts

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

Source: README.md

See also: tablegx-advanced/SKILL.md — editable TabbedTable tabs
