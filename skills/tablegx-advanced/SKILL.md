---
name: tablegx-advanced
description: >-
  TabbedTable multi-view tables, shared cross-tab filters and row selection,
  idColumn, nested rows (enableExpanding, getSubRows), footer aggregates on
  filtered leaves, column visibility persistence, frozen columns during tab slide.
  Use for tabbed views, tree grids, or shared filter/selection across column sets.
type: core
library: tablegx
library_version: "2.0.0"
sources:
  - "TableGX:packages/tablegx/README.md"
  - "TableGX:packages/tablegx/src/types.ts"
  - "TableGX:packages/tablegx/src/components/TabbedTable.tsx"
---

# @twentygx/tablegx — Advanced Features

## Setup — TabbedTable

```tsx
import { TabbedTable, textColumn, numberColumn } from '@twentygx/tablegx'
import type { TabbedTableTab } from '@twentygx/tablegx'

type Row = { id: string; name: string; beds: number }

const tabs: TabbedTableTab<Row>[] = [
  {
    id: 'overview',
    label: 'Overview',
    frozenColumns: 1,
    columns: [
      textColumn('name', 'Name', { footerLabel: 'Totals' }),
      numberColumn('beds', 'Beds', { footerAggregate: 'sum' }),
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    editable: true,
    editableColumnIds: ['name'],
    onSaveEdit: async (row, col, val) => { await save(row, col, val); return true },
    columns: [textColumn('name', 'Name', { editable: true, inputType: 'text' })],
  },
]

<TabbedTable<Row>
  data={data}
  getRowId={(r) => r.id}
  idColumn="id"
  tabs={tabs}
  enableRowSelection
  selectedRowIds={selected}
  onSelectedRowIdsChange={setSelected}
  columnVisibilityStorageKeyBase="facilities-tabs"
/>
```

**Shared state across tabs:** filters intersect all tabs; filter badges show originating tab label; selection and sorting are shared (sort entries for columns a tab lacks are ignored on that tab).

## Core Patterns

### Nested rows

```tsx
<ReadOnlyTable
  data={tree}
  columns={columns}
  getRowId={(r) => r.id}
  enableExpanding
  getSubRows={(row) => row.children}
  defaultExpanded
  onExpandedChange={setExpanded}
/>
```

Only visible (expanded) rows enter the row virtualizer. Filtering keeps parents visible when any descendant matches and auto-expands them. Selection cascades with indeterminate parent checkboxes.

### Footer aggregates

```tsx
numberColumn('amount', 'Amount', {
  footerAggregate: 'sum', // sum | avg | min | max | count
  footerFormat: (v) => `$${v.toLocaleString()}`,
  footerLabel: 'Total',
})
```

Aggregates run over **filtered leaf rows** — collapsed matching leaves still count.

### Column visibility persistence

```tsx
columnVisibilityStorageKey="my-table"           // ReadOnlyTable / EditableTable
columnVisibilityStorageKeyBase="my-tabs"        // TabbedTable → `${base}:${tab.id}`
```

### Dates (timezone-safe)

Date-only strings (`YYYY-MM-DD`) parse at midnight UTC. Use `formatDateSafe` / `parseDateSafe` from `@twentygx/tablegx` for consistency.

## Common Mistakes

### CRITICAL TabbedTable missing idColumn

Wrong:

```tsx
<TabbedTable data={data} getRowId={(r) => r.id} tabs={tabs} />
```

Correct:

```tsx
<TabbedTable data={data} getRowId={(r) => r.id} idColumn="id" tabs={tabs} />
```

`idColumn` must be the column whose values match `getRowId` — it drives cross-tab filter intersection.

Source: packages/tablegx/src/types.ts

### MEDIUM Enabling all advanced props by default

Wrong:

```tsx
<ReadOnlyTable
  enableRowSelection enableFooter enableExpanding enableColumnVisibility enableMultiSort
  ...
/>
```

Correct:

```tsx
// Enable only what the user asked for — all advanced features default off
<ReadOnlyTable enableRowSelection enableFooter ... />
```

Keeps basic tables predictable and avoids unexpected UI chrome.

Source: Table Specs.md §1

### MEDIUM Expecting footer to respect expand state only

Wrong assumption: footer sums only rows visible in the expanded tree UI.

Correct: footer aggregates include all filtered **leaf** rows regardless of expand/collapse toggle.

Source: packages/tablegx/README.md

See also: tablegx-editing/SKILL.md — editable tab configuration
