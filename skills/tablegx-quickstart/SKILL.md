---
name: tablegx-quickstart
description: >-
  Install and set up @twentygx/tablegx in React apps: Tailwind v4 @source scanning,
  theme.css import, the unified TableGX entry point, ReadOnlyTable, column factories
  (textColumn, numberColumn, dateColumn, badgeColumn, customColumn), getRowId,
  frozenColumns, enableRowSelection, enableFooter, enableRecordCount. Use when adding
  tablegx, configuring Tailwind for tablegx, or building a first read-only data grid.
type: lifecycle
library: tablegx
library_version: "2.3.0"
sources:
  - "README.md"
  - "src/index.ts"
---

# @twentygx/tablegx — Quick Start

Client-only React package (`"use client"` in bundle). Requires React 18+ or 19, optional Tailwind CSS v4 for styling.

## Setup

**Install:**

```bash
npm i @twentygx/tablegx react react-dom
npm i -D tailwindcss@4
```

**Tailwind CSS entry** (scan compiled output so utility classes are generated):

```css
@import 'tailwindcss';

@source "../node_modules/@twentygx/tablegx/dist";

@import '@twentygx/tablegx/theme.css';
```

For monorepo/workspace consumers pointing at source during dev, scan `src` instead of `dist`.

### Recommended entry point: `TableGX`

`TableGX` is the single component most apps should reach for. It's a thin preset facade over the headless compound primitives, selecting a mode with a discriminated `variant` prop so each variant exposes exactly the props that mode supports:

```tsx
import { TableGX, textColumn } from '@twentygx/tablegx'

// One table — read-only or editable, flipped live from your own state (no remount).
const [editable, setEditable] = useState(false)
<TableGX<Row>
  variant="table"
  data={data}
  columns={columns}
  getRowId={(r) => r.id}
  editable={editable}
  editableColumnIds={['name']}
  onSaveEdit={save}
/>

// Shared-dataset tabs (cross-tab filter intersection + shared selection/sort).
<TableGX<Row> variant="tabbed" data={data} getRowId={(r) => r.id} idColumn="id" tabs={tabs} />

// Fully independent per-tab tables.
<TableGX variant="independent" tabs={independentTabs} />
```

The focused components (`ReadOnlyTable`, `EditableTable`, `TabbedTable`, `IndependentTabbedTable`) remain exported and supported — `TableGX` just unifies them. See tablegx-editing (editable surface) and tablegx-advanced (tabbed/independent + primitives).

**Minimum ReadOnlyTable:**

```tsx
import {
  ReadOnlyTable,
  textColumn,
  numberColumn,
  dateColumn,
} from '@twentygx/tablegx'

type Row = { id: string; name: string; beds: number; opened: string }

const columns = [
  textColumn<Row>('name', 'Name', { footerLabel: 'Totals' }),
  numberColumn<Row>('beds', 'Beds', { footerAggregate: 'sum' }),
  dateColumn<Row>('opened', 'Opened'),
]

export function FacilitiesTable({ data }: { data: Row[] }) {
  return (
    <ReadOnlyTable<Row>
      data={data}
      columns={columns}
      getRowId={(r) => r.id}
      frozenColumns={1}
      maxHeight="70vh"
    />
  )
}
```

## Core Patterns

### Opt-in features (all default off)

```tsx
<ReadOnlyTable
  data={data}
  columns={columns}
  getRowId={(r) => r.id}
  enableRowSelection
  selectedRowIds={selected}
  onSelectedRowIdsChange={setSelected}
  enableMultiSort
  enableColumnVisibility
  columnVisibilityStorageKey="facilities"
  enableFooter
  enableRecordCount
  recordCountPosition="top"
  bordered
  isLoading={loading}
  loadingSkeleton={(widths) => <MySkeleton widths={widths} />}
  emptyMessage="No rows"
  toolbar={<MyToolbar />}
/>
```

`loadingSkeleton` (on all components) replaces the built-in skeleton while `isLoading` is true; it accepts static markup or a render fn receiving the computed visible column widths so it can mirror the grid.

### Column factories

`textColumn`, `numberColumn`, `booleanColumn`, `selectColumn`, `dateColumn`, `badgeColumn`, `customColumn` — each sets a sensible cell renderer, opts the column into the default filter (`tgxFilterFn`), and adds measurement hints where needed. `badgeColumn` wraps the value in a `Badge`; `customColumn(id, header, render, meta?)` takes a full render function for arbitrary cell content (see tablegx-editing). Plain TanStack `ColumnDef`s also work.

### Record count

`enableRecordCount` shows an opt-in row count (off by default). When a filter narrows the set it reads "Showing X of Y" (filtered vs. total leaf rows); otherwise a single total (e.g. "1,234 rows"). `recordCountPosition` is `'top'` (default — right of the toolbar) or `'bottom'` (annotation floated at the table's bottom-right). `recordCountLabel(info)` overrides the text/markup.

### Headless compound primitives

For custom chrome layouts (move the toolbar, split the tab strip), drop down to the exported primitives: `TableProvider` / `useTableStore` plus slot components (`TableContainer`, `TableTabStrip`, `TablePanels`, `TableBody`, `TableToolbar`, `TableFilterBadges`, `TableSortControl`, `TableColumnVisibility`, `TableRecordCount`), also reachable as `Table.*` and `TableGX.*`. See tablegx-advanced.

### Header width floor

`includeHeaderInAutosize` (default true; also on `TabbedTable` and per `IndependentTab`) lets the header label plus its sort/filter icons floor each column's auto-sized width. Set false to size columns from data only — a too-narrow header then truncates and its icons float over the text as a right-aligned overlay rather than disappearing. Build-time prop, not a user-facing toggle.

### Plain TanStack ColumnDef

Factory helpers are optional. Any `ColumnDef` works; set `enableColumnFilter: true` and `filterFn: tgxFilterFn` (from `@twentygx/tablegx`) to opt into filter popovers. For arbitrary cell content (badges, popovers), use `customColumn` / `meta.renderCell` plus the exported `CellOverflowList`, `isolateCellEvent`, and `cellInteractionProps` helpers (see tablegx-editing).

### Exported layout constants

`ROW_HEIGHT_PX` (56), `HEADER_HEIGHT_PX` (48), `MIN_COLUMN_WIDTH_PX` (160), `FROZEN_PANE_MAX_FRACTION` (0.5 — auto pinned cap until first pinned resize), `MAX_COLUMN_WIDTH_PX` (480).

## Common Mistakes

### CRITICAL Missing Tailwind @source scan

Wrong:

```css
@import 'tailwindcss';
@import '@twentygx/tablegx/theme.css';
```

Correct:

```css
@import 'tailwindcss';
@source "../node_modules/@twentygx/tablegx/dist";
@import '@twentygx/tablegx/theme.css';
```

Without `@source`, the table renders with missing Tailwind utilities.

Source: README.md

### CRITICAL Omitting getRowId

Wrong:

```tsx
<ReadOnlyTable data={data} columns={columns} />
```

Correct:

```tsx
<ReadOnlyTable data={data} columns={columns} getRowId={(r) => r.id} />
```

Stable ids drive selection, virtualization keys, and TabbedTable filter intersection.

Source: src/types.ts

### HIGH Wrong package import name

Wrong:

```tsx
import { ReadOnlyTable } from 'tablegx'
```

Correct:

```tsx
import { ReadOnlyTable, textColumn } from '@twentygx/tablegx'
```

Published npm name is `@twentygx/tablegx`.

Source: package.json

See also: tablegx-theming/SKILL.md — override CSS variables after importing theme.css
