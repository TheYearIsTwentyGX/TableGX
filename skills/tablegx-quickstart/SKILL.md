---
name: tablegx-quickstart
description: >-
  Install and set up @twentygx/tablegx in React apps: Tailwind v4 @source scanning,
  theme.css import, ReadOnlyTable, column factories (textColumn, numberColumn, dateColumn),
  getRowId, frozenColumns, enableRowSelection, enableFooter. Use when adding tablegx,
  configuring Tailwind for tablegx, or building a first read-only data grid.
type: lifecycle
library: tablegx
library_version: "2.1.0"
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
  bordered
  isLoading={loading}
  loadingSkeleton={(widths) => <MySkeleton widths={widths} />}
  emptyMessage="No rows"
  toolbar={<MyToolbar />}
/>
```

`loadingSkeleton` (on all three components) replaces the built-in skeleton while `isLoading` is true; it accepts static markup or a render fn receiving the computed visible column widths so it can mirror the grid.

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
