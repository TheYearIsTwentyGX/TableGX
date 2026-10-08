---
name: tablegx-editing
description: >-
  Inline editing with EditableTable: editableColumnIds, meta.editable, inputType
  (text|number|boolean|select), onSaveEdit return false to keep editor open,
  singleClickEdit, columnGroups, CellAction buttons, selectColumn/booleanColumn.
  Use when implementing editable grids, cell action buttons, or column meta.
type: core
library: tablegx
library_version: "3.9.1"
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
| `headerLabel` | Plain-text label for a custom (function/JSX) header when it should be measured differently from what it paints; `''` for icon-only headers |
| `headerExtraWidth` | Extra px the header floor reserves for icons/badges painted beside a custom header's label |
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

### Column access governance (`columnAccess`)

Opt-in per-column override supplied by the host app (e.g. a permissions layer it owns), on top of — and independent from — `editableColumnIds`/`meta.editable`:

```tsx
<EditableTable
  columns={columns}
  editableColumnIds={['name']}
  columnAccess={{ state: { editable: false }, region: { editable: true, visible: true } }}
  ...
/>
```

A column id **absent** from `columnAccess` behaves exactly as it would with the prop omitted entirely — `editableColumnIds`/`meta.editable` still decide it. A column **present** is authoritative: `visible: false` removes it from the table completely (not just the visibility-picker toggle); `editable` is an **override, not a further restriction** — `editable: true` grants edit mode even if the column is absent from `editableColumnIds` or lacks `meta.editable`, and `editable: false` blocks it even if both of those would otherwise allow it. This is what lets a host retire a hardcoded `editableColumnIds` array one governed column at a time instead of maintaining it forever underneath governance. See tablegx-advanced/SKILL.md → Column access governance for the per-tab (`TabbedTable`/`IndependentTabbedTable`) form.

### Per-cell editing control (`isCellEditable`, `getEditValue`, `getCellInputType`)

`editableColumnIds`, `meta.editable`, `meta.inputType` and `columnAccess` are all column-shaped. That is right for a table of homogeneous records and wrong for a grid whose column is a *position* rather than a type — a spreadsheet view where one column holds a date, a currency amount and a `=SUM()` total on three consecutive rows. Three per-cell hooks refine the column-level decision:

```tsx
<EditableTable
  editableColumnIds={['a', 'b']}
  // Table-level prop: veto individual cells.
  isCellEditable={(row, columnId) => row.__cells[columnId]?.kind !== 'formula'}
  columns={[
    textColumn('b', 'B', {
      editable: true,
      renderCell: (ctx) => formatCurrency(ctx.value),   // displays "$1,234.50"
      getEditValue: (row) => String(row.bRaw),          // edits "1234.5"
      getCellInputType: (row) => (typeof row.b === 'number' ? 'number' : 'text'),
    }),
  ]}
/>
```

- **`isCellEditable(row, columnId)`** — return `false` and that one cell does not enter an editor on click, **Tab skips over it** rather than landing in it, and it shows no pencil affordance. It can only ever *further restrict*: it is consulted **after** `columnAccess` and `editableColumnIds`, so it cannot grant edit rights to a column governance already withheld. Also available per-tab on `TabbedTable`/`IndependentTabbedTable` editable tabs.
- **`meta.getEditValue(row, columnId)`** — overrides the default `String(row[columnId])` edit seed. Pair with `renderCell` so a cell can *display* formatted text while its editor opens on the underlying literal. The unchanged-value comparison uses this too, so committing an untouched seeded value is still a no-op and never calls `onSaveEdit`.
- **`meta.getCellInputType(row, columnId)`** — per-cell editor kind; return `undefined` to fall back to `meta.inputType`.

Before these existed the only per-cell lever was a `pointer-events: none` class via `getCellClassName`, which stops the mouse but not the keyboard, and `onSaveEdit` returning `false` *keeps the editor open* — so a rejected cell trapped the user rather than refusing entry. Do not reach for those workarounds; use `isCellEditable`.

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
