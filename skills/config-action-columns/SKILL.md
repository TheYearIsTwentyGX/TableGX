---
name: config-action-columns
description: >
  Add interactive buttons to cells using column meta. Applies when you need to render edit, delete, or view action buttons on a per-row basis.
type: core
library: tablegx
library_version: "1.0.0"
sources:
  - "Table Specs.md"
---

# TableGX — Configure Action Columns

## Setup

Define a column and attach the `actions` array directly to its `meta` object.

```tsx
import { ColumnDef } from '@tanstack/react-table';
import { EyeIcon } from 'lucide-react';

type User = { id: string; name: string };

const columns: ColumnDef<User>[] = [
  {
    id: 'actions',
    header: '',
    meta: {
      fixedMeasureWidth: 100, // CRITICAL: Must be provided for icon columns
      actions: [
        {
          id: 'view',
          icon: <EyeIcon />,
          ariaLabel: 'View User',
          onClick: (row) => console.log('Viewing', row.id)
        }
      ]
    }
  }
];
```

## Core Patterns

### Conditionally Hiding Actions
You can dynamically hide or disable action buttons per-row by inspecting the row data.

```tsx
{
  id: 'delete',
  label: 'Delete',
  onClick: (row) => deleteUser(row.id),
  isHidden: (row) => row.isAdmin
}
```

## Common Mistakes

### HIGH Omitting fixedMeasureWidth

Wrong:

```tsx
const columns = [
  {
    id: 'actions',
    meta: {
      actions: [{ icon: <EyeIcon />, onClick: () => {} }]
    }
  }
];
```

Correct:

```tsx
const columns = [
  {
    id: 'actions',
    meta: {
      fixedMeasureWidth: 100,
      actions: [{ icon: <EyeIcon />, onClick: () => {} }]
    }
  }
];
```

Without `fixedMeasureWidth`, the action column collapses because icons have no text width to be measured during the pre-render layout phase.

Source: maintainer interview
