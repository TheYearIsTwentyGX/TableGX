---
name: TableCore column-prop identity
description: Why per-render array props (e.g. sortOnlyColumns) remount every cell and break captured-node tests.
---

TableCore derives `effectiveColumns` (and the TanStack column set) from a memo
chain keyed by the *identity* of its column-related props, notably
`sortOnlyColumns`. The `sortOnlyLeafColumns` memo early-returns a fresh `[]` when
the input is empty, and that memo only stays cached if its `sortOnlyColumns`
dependency keeps the same reference across renders.

**Rule:** Any prop feeding TableCore's column memos must have a STABLE identity
across renders when its content is unchanged. For the tab adapters, the
per-render `render(args)` closure runs on every store change (selection, sorting,
etc.); if it computes `sortOnlyColumns` as a fresh array each call, the column
set rebuilds and **every cell remounts**.

**Why it matters:** Remounting replaces DOM nodes. Tests that capture a node
(e.g. `getAllByLabelText('Select row')[0]`) before an interaction then assert on
it afterward will see a stale, detached node — the state updated correctly but
the captured node never reflects it. The bug looks like "state doesn't
propagate" when it actually does; the node was swapped out.

**How to apply:** Cache the derived array by its content key (e.g. the
foreign-sort id list joined) and return a single shared EMPTY constant for the
common no-op case. See `src/components/TabbedTable.tsx` `sortOnlyFor`.
