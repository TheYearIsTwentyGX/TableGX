# tablegx

High-performance, type-safe React data tables: **`ReadOnlyTable`**, **`EditableTable`**, **`TabbedTable`**, and **`IndependentTabbedTable`**, all layered over one virtualized engine.

- **Fast by construction** — row virtualization (TanStack Virtual), manual column virtualization for the scrollable pane, DOM-free text measurement ([@chenglou/pretext](https://github.com/chenglou/pretext)) so auto column widths are computed *before paint* with zero layout shift, and no `setTimeout`/`requestAnimationFrame` timing hacks anywhere.
- **Feature-complete** — sorting (single + shift-click multi with priority badges), per-column filter popovers (text search + faceted checklist), removable filter badges, frozen columns (split pinned/scroll panes; auto-sized pinned width caps at 50% of the viewport until you resize a pinned column, then the pane can grow wider), row selection with parent/child/indeterminate semantics, nested rows, inline editing, declarative cell action buttons, footer aggregates, column visibility persistence, column resizing, loading/empty/submitting states.
- **Composable styling** — Tailwind CSS v4 utilities + shadcn-style CSS-variable tokens. Every visual region accepts class overrides; theming is just overriding variables.

## Install

```bash
npm i @twentygx/tablegx
# peers
npm i react react-dom
```

If you use an AI coding agent, run `npx @tanstack/intent@latest install` after install to wire TableGX skills into your agent config.

Tailwind CSS v4 is a peer of the styling story: the package ships *untranspiled* Tailwind classes, so your app's Tailwind build must scan it. In your Tailwind CSS entry:

```css
@import 'tailwindcss';

/* 1. Let Tailwind see tablegx's class names */
@source "../node_modules/@twentygx/tablegx/dist";

/* 2. Default theme tokens (skip if you already define shadcn-style tokens) */
@import '@twentygx/tablegx/theme.css';
```

`theme.css` declares every token with zero-specificity `:where(...)` selectors, so any `--background`, `--primary`, etc. you define in your own `:root` / `.dark` blocks win automatically. Dark mode follows the standard `.dark` class convention.

## Quick start

```tsx
import { ReadOnlyTable, textColumn, numberColumn, dateColumn } from '@twentygx/tablegx'

type Facility = { id: string; name: string; beds: number; opened: string }

const columns = [
  textColumn<Facility>('name', 'Name', { footerLabel: 'Totals' }),
  numberColumn<Facility>('beds', 'Beds', { footerAggregate: 'sum' }),
  dateColumn<Facility>('opened', 'Opened'),
]

<ReadOnlyTable<Facility>
  data={facilities}
  columns={columns}
  getRowId={(r) => r.id}
  frozenColumns={1}
  enableRowSelection
  enableFooter
  enableColumnVisibility
  columnVisibilityStorageKey="facilities"
  maxHeight="70vh"
/>
```

### Inline editing

```tsx
import { EditableTable, textColumn, booleanColumn } from '@twentygx/tablegx'

<EditableTable<Facility>
  data={facilities}
  columns={columns}
  getRowId={(r) => r.id}
  editableColumnIds={['dba', 'beds', 'isActive']}
  onSaveEdit={async (row, columnId, value) => {
    const ok = await api.patch(row.id, { [columnId]: value })
    return ok // false keeps the editor open
  }}
  singleClickEdit
/>
```

A column is editable only when **both** `meta.editable: true` is set on the column *and* its id is in `editableColumnIds`. Editor type comes from `meta.inputType` (`'text' | 'number' | 'boolean' | 'select'`). Keyboard: **Enter** commits (Shift+Enter inserts a newline in text cells), **Escape** cancels, **blur** commits, **Tab / Shift+Tab** commits and moves to the adjacent editable cell. With `singleClickEdit`, boolean cells become directly interactive checkboxes.

### Tabbed views

```tsx
import { TabbedTable } from '@twentygx/tablegx'

<TabbedTable<Facility>
  data={facilities}
  getRowId={(r) => r.id}
  idColumn="id"
  tabs={[
    { id: 'overview', label: 'Overview', columns: overviewColumns, frozenColumns: 1 },
    { id: 'edit', label: 'Edit', columns: editColumns, editable: true,
      editableColumnIds: ['dba'], onSaveEdit: save },
  ]}
  enableRowSelection
  columnVisibilityStorageKeyBase="facilities-tabs"
/>
```

Filters set on any tab restrict every tab to the intersection of passing rows; the shared badge strip shows each filter with its originating tab. Selection and sorting are shared across tabs — a sort applied on one tab carries to every tab, and sort entries for columns a tab doesn't have are simply ignored there. The shared sort is seeded from the initially-active tab's `initialSorting` (falling back to the first tab that defines one). During the tab slide animation, the frozen pane stays visually static (counter-translated).

### Independent tabbed tables

When each tab is a **completely separate table** — its own data, row shape, identity, columns, and independent sorting/filtering/selection/visibility — use `IndependentTabbedTable`. Tabs share only the tab-strip shell and slide animation; nothing crosses between them (no `idColumn`, no cross-tab filter intersection). Build each tab with the `independentTable<TRow>()` factory, which erases the row type so heterogeneous tabs can live in one array:

```tsx
import { IndependentTabbedTable, independentTable } from '@twentygx/tablegx'
import type { IndependentTab } from '@twentygx/tablegx'

const tabs: IndependentTab[] = [
  independentTable<Person>({
    id: 'people', label: 'People', data: people, getRowId: (r) => r.id,
    columns: personColumns, enableRowSelection: true,
    enableColumnVisibility: true, columnVisibilityStorageKey: 'app-people',
  }),
  independentTable<Invoice>({
    id: 'invoices', label: 'Invoices', data: invoices, getRowId: (r) => r.id,
    columns: invoiceColumns, editable: true, editableColumnIds: ['amount'],
    onSaveEdit: saveInvoice,
  }),
]

<IndependentTabbedTable tabs={tabs} defaultTabId="people" />
```

Per-tab sorting, filters, selection, and column visibility are lifted by tab `id`, so each tab's state survives switching away and back. Chrome (filter badges, column picker, loading/empty states) reflects only the active tab. Column visibility persists under a full `columnVisibilityStorageKey` per tab (not a shared base). Because frozen columns aren't shared between tabs, the frozen pane slides out together with the scrolling pane during the tab transition (unlike `TabbedTable`, where the shared frozen pane stays visually static).

## Column metadata (`meta`)

All custom per-column behavior lives in the column def's `meta` (typed via module augmentation as `TableColumnMeta`):

| Key | Purpose |
| --- | --- |
| `editable`, `inputType`, `selectOptions` | Inline editing |
| `measureText(row)` | String to measure for non-text cells (badges, custom renders) |
| `fixedMeasureWidth` | Fixed content width (px); skips sampling (icon/action columns) |
| `maxColumnWidth` | Per-column auto-size clamp (the measured header width is always the floor) |
| `footerAggregate` (`sum\|avg\|min\|max\|count`), `footerFormat`, `footerLabel` | Footer row |
| `actions` | Declarative cell action buttons (`isHidden`, `isDisabled`, `confirm`, `tooltip`, async busy state, click isolation) |

Column factory helpers (`textColumn`, `numberColumn`, `booleanColumn`, `selectColumn`, `dateColumn`, `badgeColumn`) wire up sensible cells, the default filter, and measurement hints. Plain TanStack `ColumnDef`s work too — set `enableColumnFilter: true` to opt a column into the filter popover.

## Nested rows

```tsx
<ReadOnlyTable
  data={tree}
  enableExpanding
  getSubRows={(row) => row.children}
  defaultExpanded            // or { [rowId]: true }
  onExpandedChange={(next) => ...}
  ...
/>
```

Only visible (expanded) rows hit the virtualizer. Filtering keeps a parent visible when any descendant matches and auto-expands it; selection cascades to descendants with indeterminate parent states; an expand/collapse-all affordance renders in the toolbar.

## Dates

Date-only strings (`"YYYY-MM-DD"`) are parsed at **midnight UTC** and formatted with UTC fields (`formatDateSafe` / `parseDateSafe`), so a stored `2024-01-01` never renders as 12/31 in western timezones.

## Footer semantics

Aggregates compute over the **currently-filtered leaf rows** — collapsed-but-matching leaves still count, so totals don't jump when toggling disclosure.

## Customization

- `classNames` slot object on every component (`root`, `toolbar`, `filterBadges`, `headerRow`, `headerCell`, `groupHeaderCell`, `bodyRow`, `bodyCell`, `footerRow`, `footerCell`, `empty`, `skeleton`, plus `container`/`tabStrip`/`tab`/`activeTab`/`inactiveTab`/`tabIndicator`/`panel` on `TabbedTable`). Caller classes win (merged with `tailwind-merge`).
- `getCellClassName(row, columnId)` for per-cell conditional styling (e.g. pending-edit highlights).
- All colors flow through CSS variables; override `--primary`, `--card`, `--tgx-header-bg`, `--tgx-row-hover-bg`, `--tgx-row-selected-bg`, … to retheme.
- Stable data-attribute hooks for plain-CSS theming (e.g. backdrop blurs on translucent themes): `[data-tgx-table]`, `[data-tgx-tabbed-table]`, `[data-tgx-toolbar]`, `[data-tgx-header-block]` (the sticky header), `[data-tgx-footer-row]`, `[data-tgx-pinned]` (every frozen pane: header, body rows, footer), `[data-tgx-tab-strip]`, `[data-tgx-row]`, `[data-tgx-cell]`, `[data-tgx-header]`, `[data-tgx-pop]` (popovers/menus), `[data-tgx-dialog]`. If you give the header/pinned surfaces translucent backgrounds, pair them with a `backdrop-filter` on `[data-tgx-header-block]` / `[data-tgx-pinned]` so rows scrolling behind them don't bleed through.
- `measure?: (text, font) => number` lets you inject a custom text measurer (also how tests stub measurement).

## SSR

The package is client-only (`"use client"` is preserved in the bundle). Text measurement needs canvas, so on the server columns render at the fallback minimum width and re-measure in a pre-paint layout effect during hydration — no visible shift. `window` / `localStorage` / `ResizeObserver` access is guarded throughout.

## Constants

Fixed layout invariants (exported): `ROW_HEIGHT_PX` (56), `HEADER_HEIGHT_PX` (48), `MIN_COLUMN_WIDTH_PX` (160), `ABSOLUTE_MIN_COLUMN_WIDTH_PX` (48), `FROZEN_PANE_MAX_FRACTION` (0.5 — caps combined **auto-sized** pinned width until the user resizes any pinned data column; after that, the frozen pane may exceed this fraction), `INDENT_STEP_PX` (20), `MAX_COLUMN_WIDTH_PX` (480).

## License

MIT
