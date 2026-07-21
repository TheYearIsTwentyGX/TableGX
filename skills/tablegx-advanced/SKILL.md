---
name: tablegx-advanced
description: >-
  TabbedTable multi-view tables, shared cross-tab filters and row selection,
  IndependentTabbedTable (fully separate per-tab tables), idColumn, nested rows
  (enableExpanding, getSubRows), footer aggregates on filtered leaves, column
  visibility persistence, frozen columns during tab slide, hover tab column
  preview (enableTabColumnPreview), Ctrl+G column jump (enableColumnJump),
  frozen sort order across data changes. Use for tabbed views, tree grids,
  shared/independent filter/selection across column sets, or jump-to-column
  navigation.
type: core
library: tablegx
library_version: "3.5.0"
sources:
  - "README.md"
  - "src/types.ts"
  - "src/components/TabbedTable.tsx"
  - "src/components/IndependentTabbedTable.tsx"
---

# @twentygx/tablegx — Advanced Features

## TableGX variants

`TableGX` is the unified entry point; the tabbed/independent modes are selected with a `variant` prop and forward to the components documented below:

```tsx
<TableGX<Row> variant="tabbed" data={data} getRowId={(r) => r.id} idColumn="id" tabs={tabs} />
<TableGX variant="independent" tabs={independentTabs} defaultTabId="people" />
```

`variant="tabbed"` accepts the same props as `TabbedTable`; `variant="independent"` the same as `IndependentTabbedTable`. The standalone components stay exported. See tablegx-quickstart for the `variant="table"` (single read-only/editable) mode.

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

**Shared state across tabs:** filters intersect all tabs; filter badges show originating tab label; selection is shared. **Sorting is fully shared** — sorting by any column reorders rows on *every* tab, including tabs that don't render that column (its values still drive the order there; only the active tab's own columns show a sort indicator).

**`enableSortHierarchy`** (default off) adds a toolbar button that opens a popover for managing the shared multi-column sort: reorder priority, flip each column's direction, or remove a column. Pair with `enableMultiSort` (shift-click headers) for the full multi-sort workflow. Columns that are sorted but not present on the active tab still resolve a readable label, drawn from the union of all tabs' columns.

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
    selectedRowIds: peopleSelected,       // optional: controlled, per this tab only
    onSelectedRowIdsChange: setPeopleSelected,
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

<IndependentTabbedTable
  tabs={tabs}
  defaultTabId="people"        // uncontrolled initial tab
  // activeTabId / onActiveTabChange  → control the active tab from your own state
  // actions={<RefreshButton />} → right-aligned tab-strip controls
/>
```

The active tab can be uncontrolled (`defaultTabId`) or controlled (`activeTabId` + `onActiveTabChange`); `actions` renders right-aligned controls in the tab strip. `TabbedTable` exposes the same `activeTabId` / `defaultTabId` / `onActiveTabChange` / `actions` controls.

**Row selection is per-tab, and independently controllable.** Each tab's `selectedRowIds`/`onSelectedRowIdsChange` (in its `independentTable()` config, as above) is entirely its own — selecting a row on one tab never touches another tab's selection, unlike `TabbedTable`'s group-level selection. Omit both to keep a tab's selection uncontrolled (internal state, e.g. for a simple "just let users check rows" case); pass both when the caller needs to read out or seed the checked set — a bulk-action toolbar, for instance, that applies one operation to every selected row and needs the list of ids.

**Tab column preview** (both `TabbedTable` and `IndependentTabbedTable`, default off): `enableTabColumnPreview` shows a popover on tab-header hover listing that tab's hideable columns alphabetically, so users can tell what's on a tab without switching to it. `tabColumnPreviewDelayMs` sets the hover delay before it opens (default 600); `tabColumnPreviewPosition` places it `'above'`, `'below'`, or `'auto'` (default) relative to the tab strip. Columns with `enableHiding: false` are excluded from the list. The `TabColumnPreviewPosition` type is exported.

**Per-tab independence:** each tab keeps its own sorting, column filters, row selection, and column visibility, lifted by tab `id` so state survives tab switches. Chrome (filter badges, column picker, loading/empty states) reflects only the active tab. There is no `idColumn` and no cross-tab intersection — that concept is exclusive to `TabbedTable`. Column visibility persistence uses a full `columnVisibilityStorageKey` per tab (not a shared base). Frozen columns aren't shared across tabs, so the frozen pane slides out with the scrolling pane during the transition (`TabbedTable` instead keeps its shared frozen pane visually static).

## Core Patterns

### Sorting — frozen across data changes

Row order only recomputes on an explicit sort action (a header click, `enableMultiSort` shift-click, or a controlled-sorting-prop change) — it never resorts just because `data` changed, so editing a value in the sorted column doesn't yank that row out from under the user mid-edit. A row added while sorted is inserted at its correct comparator-based slot without disturbing the others; if that slot is outside the current scroll position the table snaps to it (no animation) and flashes it via `[data-tgx-just-added]` (see tablegx-theming). Applies to `ReadOnlyTable`, `EditableTable`, `TabbedTable`, and `IndependentTabbedTable` — no prop to enable, it's the default.

On `TabbedTable`, this composes with the shared-sort behavior above: since only the **active** tab stays mounted (inactive tabs unmount), switching away and back resets that tab's frozen order to a fresh sort by current values. This is consistent with how other per-tab transient UI state behaves here — not a bug, but worth knowing if a "did my row move?" report only reproduces after a tab switch.

Source: README.md

### Column jump (Ctrl+G / Cmd+G)

```tsx
<ReadOnlyTable
  data={data}
  columns={columns}
  getRowId={(r) => r.id}
  enableColumnJump
  columnJumpIncludeHidden   // default true — un-hides a hidden column on selection
  // columnJumpGlobalShortcut // default false — see caveat below
  classNames={{ columnJumpDialog: 'max-w-md' }}
/>
```

Ctrl+G (Cmd+G on Mac) opens a searchable dialog listing every column; picking one scrolls it into view. Available on `ReadOnlyTable`, `EditableTable`, `TabbedTable`, and `IndependentTabbedTable` — on the tabbed variants the dialog lists columns across **all** tabs, and picking one on another tab switches to it first, then scrolls.

- `columnJumpIncludeHidden` (default true): whether hidden columns appear in the list; selecting one un-hides it.
- `columnJumpGlobalShortcut` (default false): by default the shortcut is scoped to hover-or-focus — it fires only while the mouse is over a table with `enableColumnJump`, or focus is already inside one, so multiple such tables can coexist on a page without stealing each other's keypress. Setting this to `true` makes the shortcut fire unconditionally whenever this table is mounted — only do that when you know at most one `enableColumnJump` table is mounted at a time.
- Style the dialog with `classNames.columnJumpDialog`.

Source: src/types.ts

### Row height

Body rows are a fixed **56px** by default. `rowHeight` overrides that:

```tsx
<ReadOnlyTable rowHeight={72} ... />                               // uniform fixed pixel height
<ReadOnlyTable rowHeight={(row) => (row.featured ? 96 : 56)} ... /> // per-row pixel height
<ReadOnlyTable rowHeight="auto" ... />                            // content-driven (wraps), 56px floor
```

- **number / `(row) => number`** — explicit pixel heights fed straight to the virtualizer; **no DOM measurement**. Cells stay single-line/truncated. Works with both row and column virtualization on.
- **`'auto'`** — rows grow to fit wrapped content, with 56px as a minimum floor; cells top-align and wrap (`break-words`) instead of truncating. Heights are measured per row, so **column virtualization is turned off in this mode** (every column renders so content can drive the height); **row virtualization still applies**. Best for narrower tables.
- Leaving `rowHeight` unset is byte-for-byte the previous fixed-56px behavior.
- Available on `ReadOnlyTable`, `EditableTable`, `TableGX` (`variant="table"`), and `TabbedTable` (applies to every tab). On `IndependentTabbedTable` set it **per tab** in the tab config. A uniform numeric `rowHeight` also drives the loading skeleton's row height.

Source: src/types.ts

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

### Column access governance

`columnAccess` (opt-in, per-tab — a field on each `TabbedTableTab`/`IndependentTabBase`, not a whole-instance prop) lets a host app narrow which columns render and which are editable, driven by data it resolves externally (e.g. a permissions layer):

```tsx
type ColumnAccessMap = Record<string, { visible?: boolean; editable?: boolean }>
```

A column id **absent** from the map is unrestricted — static `meta.editable`/`editableColumnIds`/`enableHiding` decide it exactly as if `columnAccess` were omitted. A column **present** with `visible: false` is removed entirely (header, body, the visibility picker, column-jump — everywhere), not just toggled via the user-facing picker. A column present with `editable` set is **authoritative** for that column — overriding, not merely restricting, its own `meta.editable`/`editableColumnIds` — so a host can retire a static allowlist one governed column at a time. See tablegx-editing for the base-table (`ReadOnlyTable`/`EditableTable`/`TableGX`) form of this same prop.

### Loading skeleton

`TabbedTable` (like the base tables) accepts `isLoading` plus an optional `loadingSkeleton` — static markup or `(widths) => ReactNode` receiving the computed visible column widths to mirror the grid layout. Each `IndependentTab` carries its own `isLoading` / `loadingSkeleton`.

### Record count

`enableRecordCount` (on the base tables, `TabbedTable`, and per `IndependentTab`) shows an opt-in count: "Showing X of Y" when filters narrow the leaf set, else a single total. `recordCountPosition` is `'top'` (default) or `'bottom'`; `recordCountLabel(info)` overrides the text. On `TabbedTable` a top count renders in the tab strip.

### Global search

`enableGlobalSearch` (opt-in, off by default; on the base tables, `TableGX`, `TabbedTable`, and per `IndependentTab`) adds a single search box that filters rows by a case-insensitive "includes" match across all searched columns at once. This is distinct from the per-column filter popovers and can be used alongside them (both narrow the set).

```tsx
<ReadOnlyTable
  data={data}
  columns={columns}
  getRowId={(r) => r.id}
  enableGlobalSearch
  searchPlaceholder="Search rows…"          // optional; defaults to "Search…"
  searchableColumns={['name', 'city']}      // optional; restricts which columns are searched
  globalSearch={query}                      // optional controlled value (base tables / TableGX)
  onGlobalSearchChange={setQuery}           // optional controlled handler
/>
```

- **Which columns are searched:** an explicit `searchableColumns` array takes precedence; otherwise every visible, non-selection column participates unless it opts out with `meta: { searchable: false }` on its column def.
- **Placement:** single-table mode renders the box in the toolbar (before the sort/columns/record-count cluster). `TabbedTable` and `IndependentTabbedTable` render it in the tab strip. In shared `TabbedTable` the query is shared across tabs; in `IndependentTabbedTable` each tab keeps its own.
- **Record count** reflects the searched (and filtered) row set.
- A clear "x" button appears once there's a query.
- Headless: the `Table.Search` / `TableGX.Search` primitive (and `TableSearch` export) renders the same box wired to the store; it renders nothing unless the active tab enables search.

Source: src/types.ts

### Selection count

Row selection is shared (group-level) on `TabbedTable`; on `IndependentTabbedTable` it's per-tab and independently controllable (see above). Either way, read the current count from the `selectedRowIds` array you pass to `selectedRowIds` / `onSelectedRowIdsChange` — there is no separate selection-count prop.

### Headless compound primitives

`TabbedTable`, `IndependentTabbedTable`, and `TableGX` are preset facades over a shared headless store. For fully custom chrome layouts, compose the slots yourself:

```tsx
import {
  TableProvider, useTableStore,
  TableContainer, TableTabStrip, TablePanels, TableBody,
  TableToolbar, TableFilterBadges, TableSortControl, TableSearch,
  TableColumnVisibility, TableRecordCount,
} from '@twentygx/tablegx'
// or via the namespaces: Table.Provider / Table.TabStrip / …  and  TableGX.Provider / TableGX.TabStrip / …
```

`TableProvider` (`mode: 'shared' | 'independent'`) owns all cross-cutting state; `useTableStore()` reads it (throws outside a provider). The slot components render the tab strip, panels, toolbar, filter badges, sort-hierarchy control, global-search box, column-visibility picker, and record count, each wired to the store. The facades above are the recommended path — reach for the raw primitives only when you need to rearrange the chrome.

### Auto-size header floor

`includeHeaderInAutosize` (default true; on `ReadOnlyTable`, `TabbedTable`, and per `IndependentTab`) makes the header label plus its sort/filter icons a floor on each column's auto-sized width. Set false to size columns purely from data-cell content — a too-narrow header then truncates and its icons fall back to a floating right-aligned overlay instead of being hidden. Build-time prop, not a user-facing toggle.

### Many tabs

When the tabs overflow their container the tab strip scrolls horizontally (no visible scrollbar); the active tab is kept in view. No prop required.

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
