# Column access governance (opt-in visibility/editability from a host resolver)

## Overview

Let a consuming app narrow, per column, which columns render at all
("visibility") and which are editable ("editability") — driven by data the
*host app* resolves externally (e.g. a permissions/policy system) and hands
in as a plain prop. TableGX does not know or care what the data means or
where it came from; it only consumes a resolved `{columnId: {visible,
editable}}` map and applies it consistently across every table surface the
library exports: `ReadOnlyTable`, `EditableTable`, `TableGX`
(`variant="table"`), `TabbedTable`, and `IndependentTabbedTable`.

This is the TableGX-side half of a two-part system. The other half — a
Prisma-backed rule store, an admin editor, and a `useColumnAccess(gridId)`
hook that resolves the map — lives in the consuming app (LTCDataPlus) and is
out of scope for this document and this package. TableGX's job is just the
generic mechanism: accept the resolved map, apply it. See "Consumer-side
context" near the end for the shape this pairs with.

## Goals

- A column present in the resolver map with `visible: false` is removed from
  the table entirely — not hidden via the existing user-facing visibility
  picker (which is a re-toggleable preference), a hard removal from
  rendering, sizing, the picker, column-jump, everything.
- A column present in the map with `editable: false` can never enter edit
  mode, *regardless* of its static `meta.editable` / `editableColumnIds`
  configuration — governance is authoritative once a column is governed.
- A column **absent** from the map behaves exactly as it does today — static
  `meta.editable` / `editableColumnIds` / `enableHiding` still decide it.
  This is what makes per-column, per-grid migration possible: a host app can
  govern one column, one tab, one grid at a time without touching the rest.
- Applies uniformly whether a table is standalone (`ReadOnlyTable`,
  `EditableTable`, `TableGX`) or part of a tabbed surface (`TabbedTable`,
  `IndependentTabbedTable`) — in the tabbed case, governance is supplied
  **per tab**, matching how `columns` and `editableColumnIds` already work
  (each tab owns its own dataset and permissions; there is no single
  whole-instance list to hang this off of).
- Opt-in, default `undefined` (no governance data at all), so it is a no-op
  — zero behavioral change — for every existing consumer until they start
  passing the prop.

## Non-goals

- TableGX does not fetch, cache, or know how to resolve the map. The host
  calls its own hook/query *outside* TableGX and passes the already-resolved
  plain object in. No `async`, no built-in loading state for this feature —
  if the host's own resolution is still loading, it decides what to pass in
  the meantime (e.g. `undefined` to render ungoverned, matching this
  package's existing "everything is opt-in and additive" posture).
- No new predicate language, no `AccessRule`-shaped anything in this
  package's public API. The contract is the flattened, already-evaluated
  result: booleans, not rules.
- No governance UI (no "why is this hidden" tooltip, no admin surface) —
  that's the host app's editor, not this package's concern.
- No relaxing beyond what static config already allows. Governance can only
  **narrow** what a column may do vs. its own static config — see "Why
  editability is override-not-relax" below. (Visibility has no analogous
  static baseline to stay under: a governed-hidden column is just gone.)

## Why this lives in `TableCore`

Same reasoning as the column-jump feature
(`docs/superpowers/specs/2026-07-10-column-jump-shortcut-design.md`):
`ReadOnlyTable` and `EditableTable` spread their props straight into
`TableCore` with no tab store at all
(`src/components/ReadOnlyTable.tsx`, `src/components/EditableTable.tsx`).
`TabbedTable`/`IndependentTabbedTable` mount exactly one tab's `TableCore` at
a time and forward that tab's own props into it
(`src/primitives/TablePanels.tsx`). `TableCore` is the one place every
surface funnels through, and — critically for this feature — it's also the
single place the raw `columns` prop gets turned into what's actually fed to
`useReactTable` (the `effectiveColumns` memo, `src/core/TableCore.tsx:655`).
Filtering there means every downstream consumer of the column list — the
visibility picker, column-jump, frozen-pane width math, column grouping, the
footer/aggregates row — sees the governed list automatically, with zero
special-casing needed in any of those features.

## Why editability is override-not-relax

Visibility has an easy story: governed-hidden means gone, full stop. Edit­ability
needs more care, because two different "who decides" models are plausible:

1. **Relax model** — governance can only make a column *more* restrictive
   than its static config already is (`editable = staticEditable &&
   governedEditable`). Every governed column still needs its
   `editableColumnIds` entry AND `meta.editable: true` maintained forever,
   with governance as a second gate on top.
2. **Override model** (**chosen**) — for a column *present* in the map,
   governance's `editable` value is authoritative, full stop, ignoring
   `meta.editable`/`editableColumnIds` for that column entirely. For a
   column *absent* from the map, existing static logic applies unchanged.

The override model is the one that actually lets a host app retire its
hardcoded `editableColumnIds` array over time, column by column, rather than
maintaining it forever as a second parallel source of truth the governance
layer merely narrows. It also composes correctly with partial migration: a
host renders the exact same static `editableColumnIds` list it always has,
and as governance comes online for a subset of those columns, that subset's
real permission takes over while the rest keep behaving exactly as before —
no coordinated "flip the whole array" moment required.

## Public API additions

**`ColumnAccessMap`** — new exported type (`src/types.ts`):

```ts
/**
 * Per-column resolved access, supplied by the host app (e.g. a policy/
 * permissions layer it owns). TableGX does not interpret how these values
 * were derived — only what to do with them.
 *
 * A column id **absent** from the map is unrestricted: existing static
 * `meta.editable`/`editableColumnIds`/`enableHiding` config decides it,
 * exactly as if `columnAccess` were never passed at all. This is what makes
 * per-column, incremental adoption possible.
 */
export type ColumnAccessMap = Record<
  string,
  { visible?: boolean; editable?: boolean }
>
```

**`AdvancedFeatureProps<TRow>`** (`src/types.ts`) — inherited by
`ReadOnlyTableProps`, `EditableTableProps`, and `TableGXTableProps`
automatically, covering the three standalone (non-tabbed) surfaces:

```ts
columnAccess?: ColumnAccessMap
```

**`CommonTab<TRow>`** (`src/types.ts`) — covers `TabbedTable`, since both
`ReadOnlyTab` and `EditableTab` extend it:

```ts
columnAccess?: ColumnAccessMap
```

**`IndependentTabBase<TRow>`** (`src/types.ts`) — covers
`IndependentTabbedTable`:

```ts
columnAccess?: ColumnAccessMap
```

`columnAccess` is deliberately **per-tab**, not a `TabbedTableProps`
top-level prop threaded like `enableRowSelection`/`enableColumnJump` are.
Those are whole-instance features (one selection state, one shortcut,
shared across every tab). Governance is exactly like `columns` and
`editableColumnIds` — each tab owns its own dataset and its own permissions
— so it lives directly on the tab object, the same place those already do.
Do **not** add it to `TabbedTableProps`'s `Pick<AdvancedFeatureProps<TRow>,
...>` list.

**Export `getColumnId`** (`src/hooks/useAutoColumnWidths.ts:49`) from
`src/index.ts`. It already exists and is exactly the id-resolution logic
(`col.id ?? col.accessorKey`) `TableCore` itself uses internally to key
`sortOnlyLeafColumns` and elsewhere. Exporting it lets a host app derive the
same column-id list its own registration/resolution code needs directly
from the `ColumnDef[]` it's already building for the table, instead of
re-deriving (and risking a drift from) that logic independently. This is the
one piece of "automatic" the host gets for free: it never has to
hand-type a parallel list of column keys — `columns.map(getColumnId)` is the
authoritative list, always in sync with what's actually rendered.

## `TableCore` behavior

New prop: `columnAccess?: ColumnAccessMap`, threaded alongside the existing
`editableColumnIds` destructuring (`src/core/TableCore.tsx:514`).

1. **Visibility filtering.** Immediately where `columns` is used
   (`src/core/TableCore.tsx:641` onward — both `sortOnlyLeafColumns`'s `own`
   Set and `effectiveColumns`), filter the raw `columns` prop *before* any
   derived list is built from it:

   ```ts
   const governedColumns = useMemo(
     () =>
       columnAccess
         ? columns.filter((c) => columnAccess[getColumnId(c)]?.visible !== false)
         : columns,
     [columns, columnAccess],
   )
   ```

   Use `governedColumns` everywhere `columns` was previously read in this
   file. Filtering this early — before the `sortOnlyLeafColumns` computation
   and before the `enableRowSelection` selection-column injection in
   `effectiveColumns` — means:
   - The synthetic selection column (`SELECTION_COLUMN_ID`) is never a
     governance candidate (it doesn't exist in `columns` at filter time, so
     there's nothing to special-case).
   - Cross-tab `sortOnlyColumns` (foreign hidden sort-only columns,
     `src/core/TableCore.tsx:641`) are computed from a tab's *own* governed
     list, which is correct — a foreign column forced invisible for shared
     sorting was never a real candidate for this tab's governance anyway.
   - The visibility picker, column-jump dialog, frozen-pane width math,
     column grouping, and the footer/aggregates row all read from
     `effectiveColumns`/the resulting TanStack `table` instance's leaf
     columns — none of them need any governance-specific code, because the
     column was never in the model they build from.
   - A governed-hidden column absent from the model can't be un-hidden via
     the visibility picker or re-surfaced via column-jump — there is nothing
     there to toggle. (Contrast with `enableHiding: false`, which keeps a
     column in the model but blocks the *user* from toggling it — governance
     removes the column outright, a stronger guarantee.)

2. **Editability override.** Update `canEditColumn`
   (`src/core/TableCore.tsx:1144`):

   ```ts
   const canEditColumn = useCallback(
     (columnId: string, meta: { editable?: boolean } | undefined): boolean => {
       if (!editable) return false
       const governed = columnAccessRef.current?.[columnId]
       if (governed) return governed.editable === true
       if (meta?.editable !== true) return false
       return editableColumnIdsSetRef.current?.has(columnId) ?? false
     },
     [editable],
   )
   ```

   Note the table-level `editable` boolean (the whole-table read-only/edit
   toggle) still gates everything first — governance narrows *which*
   columns are editable when the table itself is in edit mode, it does not
   flip the table into edit mode on its own. Add a `columnAccessRef` next to
   the existing `editableColumnIdsSetRef` pattern (`src/core/TableCore.tsx:
   1127-1132`) so `canEditColumn`'s identity stays stable across
   `columnAccess` reference changes, matching the existing ref-bridge idiom
   used everywhere else in this file for the same reason (memoized rows
   skipping re-renders on scroll — see the comment at
   `src/core/TableCore.tsx:1120`).

   `findAdjacentEditable` (`src/core/TableCore.tsx:1153`) already calls
   `canEditColumn` and needs no separate change — arrow-key edit navigation
   picks up the override for free.

## `TabbedTable.tsx` / `IndependentTabbedTable.tsx` wiring

Both components already forward each tab's own `columns`/`editableColumnIds`
into that tab's `<TableCore>` call inside its `render` closure
(`src/components/TabbedTable.tsx`, `src/components/IndependentTabbedTable.tsx`).
Add `columnAccess` to the same destructure-and-forward list — no new
bridging state needed in `src/primitives/store.tsx`, unlike column-jump.
Governance is static per-render data (a plain object the host recomputes
when its own query resolves), not interactive state the store needs to own
or coordinate across tabs the way selection/sorting/scroll-jump are.

## Interaction with existing features (edge cases)

- **`enableColumnVisibility` picker.** A governed-hidden column is absent
  from `effectiveColumns`, so it's absent from whatever list
  `ColumnVisibilityPicker` builds (already sourced from the live column
  model, not the raw `columns` prop) — no change needed in that component.
- **Column-jump (`enableColumnJump`).** Same reasoning — entries are built
  from the TanStack `table` instance's leaf columns
  (`docs/superpowers/specs/2026-07-10-column-jump-shortcut-design.md`,
  step 2), which never include a governed-hidden column.
- **Frozen/pinned columns (`frozenColumns`).** A governed-hidden column
  that would have been inside the frozen pane is simply not there — the
  frozen-column-count math (`frozenColumns` counts leaf columns positionally
  after filtering) shifts naturally since it operates on the already-filtered
  list. No special-casing.
- **Column groups (`columnGroups`).** A group definition that references a
  now-fully-hidden set of columns renders as an empty/absent group the same
  way it already does today if a consumer's `columns` array simply omits
  those ids — no new behavior to build, just confirm existing empty-group
  handling is graceful (likely already is, since `columns` arrays already
  vary in which ids they include per grid/tab).
- **Sort-only foreign columns (`sortOnlyColumns`).** Addressed above —
  computed from the post-governance list, which is correct.
- **`TableGX`'s live `editable` toggle.** Flipping the whole table between
  read-only and edit mode is unaffected; governance only ever narrows which
  columns are editable *within* edit mode.
- **`columnAccess` reference changes on every render.** If a host passes a
  freshly-constructed object literal each render (e.g. inline
  `columnAccess={{...}}` instead of memoized query data), the visibility
  `useMemo` and the `columnAccessRef` bridge both handle it correctly
  (recompute / re-point respectively) — just less efficiently than a
  host-memoized map. Not a correctness issue, worth a callout in the prop's
  JSDoc so a consumer knows to memoize (e.g. return the query result
  directly, as `@tanstack/react-query` already does).
- **`columnAccess` omitted entirely (default).** `governedColumns === columns`
  (reference-equal, no-op filter skipped) and `canEditColumn` never consults
  `columnAccessRef` — zero behavioral or referential-equality change for
  every existing consumer.

## Backwards compatibility & versioning

- Purely additive: one new optional prop threaded through existing optional-prop
  plumbing, one new exported type, one newly-exported (already-existing)
  function. No existing prop, type, or behavior changes when `columnAccess`
  is omitted.
- Minor version bump (this is a new feature, not a breaking change) —
  `@tutera/tablegx` is consumed from a private registry; downstream
  consumers (LTCDataPlus and any others) pick it up on their next dependency
  bump, at their own pace.
- Since this package may have consumers beyond LTCDataPlus, the public API
  surface (`ColumnAccessMap`, the prop name, `getColumnId`'s export) is
  intentionally generic — no naming or shape borrowed from LTCDataPlus's
  `AccessRule` DSL, Prisma models, or "Column Access Rules" terminology.

## Testing

New test file `test/columnAccess.test.tsx` covering:

- `columnAccess` omitted: no filtering, `canEditColumn` behaves exactly as
  today (regression-guard against this feature accidentally changing
  default behavior).
- A column with `{visible: false}` is absent from the rendered header/body
  cells, the visibility picker's item list, and column-jump's entry list.
- A column with `{visible: true}` (or simply present with `editable` only)
  renders normally.
- A column with `{editable: false}` cannot enter edit mode even when
  `meta.editable: true` and it's in `editableColumnIds` — click-to-edit and
  arrow-key navigation (`findAdjacentEditable`) both skip it.
- A column with `{editable: true}` enters edit mode even when **absent**
  from `editableColumnIds` (confirms override, not relax, per the design
  decision above) — as long as `meta.editable: true` is *not* required by
  the override path (double-check: the design above says governed
  `editable` is authoritative regardless of `meta.editable` too — write the
  test to confirm this explicitly, since it's the subtler of the two
  override semantics).
- A column **absent** from the map: static `meta.editable`/
  `editableColumnIds` decide it exactly as without this feature.
- `TabbedTable`: two tabs with different `columnAccess` maps — confirm each
  tab's governance only ever applies to that tab's own columns.
- `frozenColumns` math and column-group rendering still work correctly with
  a governed-hidden column removed from the middle of the array (not just
  the end).

## Consumer-side context (informational — not part of this package's work)

The host app this was designed against resolves `ColumnAccessMap` from a
DB-backed rule store (view/edit rules per column, versioned and audited),
via a hook shaped like `useColumnAccess(gridId): { columnAccess:
ColumnAccessMap, isLoading }`. Once this ships, that hook's own
client-side `filterColumns()` helper (which currently does by-hand what
`TableCore` will now do internally) becomes unnecessary — the consumer just
passes `columnAccess={access}` straight into whichever TableGX component it
renders. Rolling that consumer-side simplification out, and wiring
`getColumnId` into the consumer's own grid-registration code so it stops
hand-typing parallel column-key lists, is separate follow-up work in that
app's own repo, not something this package's changes require or block on.
