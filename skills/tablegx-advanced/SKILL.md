---
name: tablegx-advanced
description: >-
  TabbedTable multi-view tables, shared cross-tab filters and row selection,
  IndependentTabbedTable (fully separate per-tab tables), idColumn, nested rows
  (enableExpanding, getSubRows), footer aggregates on filtered leaves, column
  visibility persistence, frozen columns during tab slide. Use for tabbed views,
  tree grids, or shared/independent filter/selection across column sets.
type: core
library: tablegx
library_version: "2.2.0"
sources:
  - "README.md"
  - "src/types.ts"
  - "src/components/TabbedTable.tsx"
  - "src/components/IndependentTabbedTable.tsx"
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

## Setup — IndependentTabbedTable

Use when each tab is a **completely separate table** — its own data, row shape, identity, columns, and independent sorting/filtering/selection/visibility. Tabs share only the tab-strip shell and slide animation; nothing crosses between them. `TabbedTable` (above) is for multiple views over **one** dataset; reach for `IndependentTabbedTable` when the rows differ per tab.

```tsx
import {
  IndependentTabbedTable,
  independentTable,
  textColumn,
  numberColumn,
} from '@twentygx/tablegx'
import type { IndependentTab } from '@twentygx/tablegx'

type Person = { id: string; name: string }
type Invoice = { id: string; amount: number }

// `independentTable<TRow>()` erases TRow so heterogeneous tabs share one array.
const tabs: IndependentTab[] = [
  independentTable<Person>({
    id: 'people',
    label: 'People',
    data: people,
    getRowId: (r) => r.id,
    columns: [textColumn('name', 'Name')],
    enableRowSelection: true,
    enableColumnVisibility: true,
    columnVisibilityStorageKey: 'app-people', // full key, NOT a base
  }),
  independentTable<Invoice>({
    id: 'invoices',
    label: 'Invoices',
    data: invoices,
    getRowId: (r) => r.id,
    columns: [numberColumn('amount', 'Amount', { editable: true })],
    editable: true,                 // this tab is independently editable
    editableColumnIds: ['amount'],
    onSaveEdit: async (row, col, val) => { await save(row, col, val); return true },
  }),
]

<IndependentTabbedTable tabs={tabs} defaultTabId="people" />
```

**Per-tab independence:** each tab keeps its own sorting, column filters, row selection, and column visibility, lifted by tab `id` so state survives tab switches. Chrome (filter badges, column picker, loading/empty states) reflects only the active tab. There is no `idColumn` and no cross-tab intersection — that concept is exclusive to `TabbedTable`. Column visibility persistence uses a full `columnVisibilityStorageKey` per tab (not a shared base). Frozen columns aren't shared across tabs, so the frozen pane slides out with the scrolling pane during the transition (`TabbedTable` instead keeps its shared frozen pane visually static).

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

### Loading skeleton

`TabbedTable` (like the base tables) accepts `isLoading` plus an optional `loadingSkeleton` — static markup or `(widths) => ReactNode` receiving the computed visible column widths to mirror the grid layout.

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

Source: src/types.ts

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

Source: README.md

### MEDIUM Expecting footer to respect expand state only

Wrong assumption: footer sums only rows visible in the expanded tree UI.

Correct: footer aggregates include all filtered **leaf** rows regardless of expand/collapse toggle.

Source: README.md

See also: tablegx-editing/SKILL.md — editable tab configuration
