---
name: Global search column gating
description: How the built-in global search picks columns and a TanStack gotcha behind it
---

The global search bar uses TanStack's `globalFilter` + a custom `globalFilterFn`,
gated per-column by `getColumnCanGlobalFilter`.

**Gotcha:** TanStack ANDs your `getColumnCanGlobalFilter` result with the column
having an `accessorFn`/`accessorKey`. Accessor-less display columns (e.g. a pure
`renderCell` column with no key) silently never participate in global search even
if your resolver returns true. The library's `textColumn`/`numberColumn`/etc use
`accessorKey`, so they work; arbitrary display columns won't.

**Column precedence rule:** explicit `searchableColumns` array wins outright;
otherwise every visible, non-selection column participates unless it opts out via
`meta.searchable === false`. Selection column is always excluded.

**Why:** keeps the single-box "search across all columns" intuitive while letting
consumers narrow scope. The deferred query (`useDeferredValue`) keeps the input
responsive on large tables — the heavy filtered-row recompute trails typing.
