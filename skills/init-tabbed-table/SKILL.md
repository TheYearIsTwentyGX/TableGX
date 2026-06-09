---
name: init-tabbed-table
description: >
  Set up a TabbedTable with shared row selections and filters. Use this skill when initializing the primary data grid wrapper, passing the generic row type, and wiring up the headless table features.
type: core
library: tablegx
library_version: "1.0.0"
sources:
  - "Table Specs.md"
---

# TableGX — Initialize TabbedTable

## Setup

Initialize the core `<TabbedTable>` component. This wraps `@tanstack/react-table` internally, so you just pass your definitions.

```tsx
import { TabbedTable } from 'tablegx';
import { ColumnDef } from '@tanstack/react-table';

type User = { id: string; name: string };

const columns: ColumnDef<User>[] = [
  { accessorKey: 'name', header: 'Name' }
];

const tabs = [
  { id: 'all', label: 'All Users', columns }
];

export function UserTable({ data }: { data: User[] }) {
  return (
    <TabbedTable
      data={data}
      tabs={tabs}
      idColumn="id"
      getRowId={(row) => row.id}
    />
  );
}
```

## Core Patterns

### Frozen Columns
You can pin leading columns so they stay static during horizontal scrolling.

```tsx
const tabs = [
  { id: 'all', label: 'All Users', columns, frozenColumns: 1 }
];
```

## Common Mistakes

### CRITICAL Using raw HTML table

Wrong:

```tsx
// Using native HTML tables negates all the TableGX virtualization and auto-sizing logic
<table>
  <thead><tr><th>Name</th></tr></thead>
  <tbody><tr><td>John</td></tr></tbody>
</table>
```

Correct:

```tsx
// Always use the TabbedTable (or ReadOnlyTable/EditableTable) wrapper
<TabbedTable data={data} tabs={tabs} idColumn="id" getRowId={row => row.id} />
```

Agents hallucinate `<table>` tags instead of using `TabbedTable`.

Source: maintainer interview
