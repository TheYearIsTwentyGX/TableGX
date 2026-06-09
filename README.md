# @twentygx/tablegx

A high-performance, type-safe, and animated React table system.

`@twentygx/tablegx` is a powerful grid component built on top of `@tanstack/react-table` and `framer-motion`. It provides layout-shift-free auto-sizing, frozen columns, inline editing, nested rows, and built-in glassmorphism aesthetics out of the box.

## Installation

```bash
npm install @twentygx/tablegx
```

*Note: `react` and `react-dom` are required peer dependencies.*

## AI Agent Support (TanStack Intent)

If you use an AI coding agent (like Cursor, Claude Code, or Copilot), this package ships with built-in Agent Skills to prevent the AI from making common mistakes.

To load the skills into your agent's context, run:

```bash
npx @tanstack/intent@latest install
```

## Quick Start

Import the components and the generated CSS styles to get started.

```tsx
import { TabbedTable, LIQUID_GLASS_THEME } from '@twentygx/tablegx';
import '@twentygx/tablegx/style.css'; // Import the required CSS

// 1. Define your data type
type User = { id: string; name: string; role: string };

// 2. Define your columns using standard TanStack Table definitions
const columns = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'role', header: 'Role' }
];

// 3. Define your tabs
const tabs = [
  {
    id: 'all',
    label: 'All Users',
    columns,
    frozenColumns: 1
  }
];

// 4. Render the table
export function App({ data }: { data: User[] }) {
  return (
    <div className="h-screen w-full bg-slate-900 p-8">
      <TabbedTable
        data={data}
        tabs={tabs}
        idColumn="id"
        getRowId={(row) => row.id}
        classNames={LIQUID_GLASS_THEME} // Use built-in themes or provide your own!
      />
    </div>
  );
}
```

## Features

- **Tabbed, Editable, and Read-Only Views**: Swap between `TabbedTable`, `EditableTable`, and `ReadOnlyTable` using the same underlying highly-optimized engine.
- **Shared Tab Filters**: Filters and selections persist and intersect seamlessly across tabs.
- **Zero Layout Shift**: Columns auto-size dynamically before paint using off-screen text measurement.
- **Frozen Panes**: Pin leading columns with sticky positioning that integrates perfectly with horizontal scroll synchronization.
- **Inline Editing**: Double-click (or single-click) to edit cells inline with built-in text, number, select, and boolean editors.
- **Nested Rows**: Built-in support for hierarchical data and expand/collapse trees.
- **Action Columns**: Easily add buttons directly to cells using column `meta.actions` without fighting click propagation.
