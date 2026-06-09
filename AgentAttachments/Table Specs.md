# Table Component System — Build-From-Scratch Specification

This document specifies a reusable React data-table system in enough detail to be
rebuilt from scratch **without access to any existing codebase**. An implementing
agent should treat this as the complete source of truth for behavior and public
API. Where a specific library is named it is a strong recommendation (the
reference implementation uses it); equivalent libraries are acceptable only if
every behavior below is preserved.

---

## 1. Goals & Philosophy

Build a high-performance, type-safe table system with three public components
layered on one shared engine:

- **`ReadOnlyTable`** — display-only grid.
- **`EditableTable`** — adds inline cell editing.
- **`TabbedTable`** — orchestrates multiple table "views" (tabs) over the *same*
  rows, sharing filters and selection across tabs.

Non-negotiable qualities:

1. **No layout shift.** Column widths are computed *before* paint via off-screen
   text measurement, not by letting the browser reflow after data arrives.
2. **Virtualized.** Must stay smooth at 10k+ rows and 50+ columns. Both rows and
   columns are virtualized.
3. **Frozen (pinned) leading columns** that stay put during horizontal scroll
   and during tab transitions.
4. **Everything is opt-in.** Every advanced feature defaults *off* so a basic
   table is trivial to use and predictable.
5. **Type-safe generics.** All components are generic over the row type.
6. **Deterministic, no timing hacks.** Never use `setTimeout(fn, 0)`,
   `requestAnimationFrame` polling, or arbitrary delays to "wait for the DOM."
   Use state-driven rendering, layout effects for post-render DOM reads, and
   callback refs for element availability.

### Recommended foundation

- **React 18+** (function components + hooks).
- **TanStack Table v8** (`@tanstack/react-table`) for the headless table model
  (column defs, sorting, filtering, row model, row selection, expansion).
- **TanStack Virtual v3** (`@tanstack/react-virtual`) for row virtualization.
  Column virtualization for the scrollable pane is implemented manually (see §13).
- **Framer Motion** for tab-slide and enter/exit animations.
- **Tailwind CSS** for styling, plus a small set of primitive UI components
  (Button, Checkbox, Input, Textarea, Select, Popover, DropdownMenu, Badge,
  Skeleton). Any accessible primitive library (e.g. Radix-based) is fine.

---

## 2. Generic Type Contract

All components are generic over the row type:

```ts
TRow extends Record<string, unknown>
```

Every component requires a stable row-id accessor:

```ts
getRowId: (row: TRow) => string | number
```

`getRowId` must return a value that is stable across re-renders and unique per
row. It drives selection, edit targeting, virtualization keys, and cross-tab
filter intersection.

---

## 3. Layout Constants

Expose these as named constants; the reference values are:

| Constant | Value | Meaning |
| :--- | :--- | :--- |
| `ROW_HEIGHT_PX` | `56` | Fixed body row height (enables row virtualization). |
| `HEADER_HEIGHT_PX` | `48` | Header row height. |
| `MIN_COLUMN_WIDTH_PX` | `160` | Pre-measurement fallback width, used only until auto-sizing resolves. |
| `ABSOLUTE_MIN_COLUMN_WIDTH_PX` | `48` | Hard floor so an empty-header column still shows its icons. |
| `FROZEN_PANE_MAX_FRACTION` | `0.5` | Frozen pane may never exceed 50% of the viewport width. |

Row height is fixed (not per-row variable) so the virtualizer can compute offsets
cheaply. Nested rows (§19) keep the same fixed height.

---

## 4. Component Architecture

```
                ┌─────────────────────────────┐
                │          TableCore          │  (internal engine — not exported
                │  virtualization, frozen     │   directly to feature code)
                │  panes, scroll sync, widths │
                └─────────────────────────────┘
                  ▲          ▲              ▲
        editable=false   editable=true   (driven by tabs)
                  │          │              │
        ┌─────────┴──┐  ┌────┴────────┐  ┌──┴───────────┐
        │ReadOnlyTable│  │EditableTable│  │  TabbedTable  │
        └────────────┘  └─────────────┘  └──────────────┘
```

- **`TableCore`** is the single rendering engine. It accepts an `editable`
  boolean and the union of all props. It owns: the split frozen/scrollable pane
  layout, row virtualization, column virtualization for the scrollable pane,
  synchronized horizontal scroll between header/body/footer, hover highlighting
  across panes, auto column widths, and column resize.
- **`ReadOnlyTable`** is a thin wrapper that renders `TableCore` with
  `editable={false}`.
- **`EditableTable`** is a thin wrapper that renders `TableCore` with
  `editable={true}` and threads the editing props.
- **`TabbedTable`** renders a tab strip plus one `ReadOnlyTable`/`EditableTable`
  per tab, and owns cross-tab shared state.

Keep `TableCore` internal. Feature code should only ever import the three
wrappers, the shared types, and a few helper utilities.

---

## 5. Column Definitions

Columns use the standard TanStack `ColumnDef<TRow>` shape. The implementing agent
must support these fields at minimum:

- `id` — unique column id (required if no `accessorKey`).
- `accessorKey` — key into the row for the value.
- `accessorFn` — derived value function (alternative to `accessorKey`).
- `header` — string or render function.
- `cell` — render function for the cell body. Defaults to stringifying the value.
- `enableColumnFilter` — whether the column shows a filter control.
- `filterFn` — filtering predicate (default to a case-insensitive "includes").
- `enableSorting` — whether the column is sortable (default true).
- `enableHiding` — whether the column may be hidden by the visibility picker.
- `enableResizing` — whether the column may be drag-resized.
- `meta` — custom per-column metadata, defined below.

### 5.1 Column `meta` (the custom contract)

A single `meta` type covers both read-only and editable concerns:

```ts
type EditInputType = 'text' | 'number' | 'boolean' | 'select'

type TableColumnMeta = {
  // --- Editing ---
  editable?: boolean
  inputType?: EditInputType
  selectOptions?: { label: string; value: string }[]

  // --- Auto-sizing hints ---
  // For cells that render non-text content (badges, icons, buttons, sparklines),
  // return the underlying string that should be measured for width. Falls back
  // to the accessor value when absent.
  measureText?: (row: Record<string, unknown>) => string
  // A fixed content width (px, excluding cell chrome/padding) to use instead of
  // measuring. Use for glyphs whose width can't be derived from text.
  fixedMeasureWidth?: number
  // Per-column max-width clamp (px) for auto-sizing. Defaults to system max.
  maxColumnWidth?: number

  // --- Footer / totals row ---
  // Aggregate computed over the currently-filtered rows for this column.
  // Numeric aggregates ignore non-numeric values; `count` tallies non-empty.
  footerAggregate?: 'sum' | 'avg' | 'min' | 'max' | 'count'
  // Formats the computed aggregate to display text. Defaults to toLocaleString().
  footerFormat?: (value: number) => string
  // Static footer text when footerAggregate is not set (e.g. a "Totals" label).
  footerLabel?: string

  // --- Cell actions (NEW — see §20) ---
  actions?: CellAction<Record<string, unknown>>[]
}
```

### 5.2 Recommended column factory helpers

Provide small factories so consumers write consistent columns, e.g.:

```ts
function textColumn<T>(id: string, header: string, meta?: TableColumnMeta): ColumnDef<T> {
  return {
    id, header, accessorKey: id,
    cell: ({ getValue }) => String(getValue() ?? ''),
    enableColumnFilter: true,
    filterFn: 'includesString',
    meta,
  }
}
```

Equivalent `numberColumn`, `booleanColumn`, `selectColumn`, `dateColumn`, and
`badgeColumn` helpers are encouraged but not required.

---

## 6. Cell Rendering

A single `BodyCell` component decides what to render:

1. If the cell is in **edit mode** (see §7), render the appropriate editor.
2. Else if the column has `meta.actions`, render the action buttons (§20) —
   composable with the normal value display.
3. Else if `meta.inputType === 'boolean'`, render a read-style checkbox with a
   "Yes/No" affordance (interactive when the table is editable + single-click).
4. Else render `columnDef.cell` via the table library's `flexRender`.

Cells:

- Are exactly `ROW_HEIGHT_PX` tall and clipped to their computed column width.
- Animate background-color on row hover; hover highlight must be synchronized
  across the frozen pane and the scrollable pane (hovering a row highlights both
  halves).
- Accept an optional per-cell `className` from the table-level
  `getCellClassName(row, columnId)` prop so callers can visually mark cells
  (e.g. "pending unsaved edit") without wrapping the renderer.

---

## 7. Inline Editing (EditableTable)

### 7.1 Enabling

- The table receives `editableColumnIds: string[]` — the whitelist of columns
  that may enter edit mode. A column must *also* have `meta.editable === true`.
- The table receives `onSaveEdit(row, columnId, value) => Promise<boolean>`.
  Resolving `true` commits the edit and closes the editor; `false` keeps the
  editor open (or reverts) so the user can correct the value.

### 7.2 Entering edit mode

- **Default:** double-click a cell to edit.
- **`singleClickEdit` mode:** cells that don't already render a control (text,
  number, select) enter edit mode on a single click. Cells that already show a
  control (boolean checkbox) become directly interactive — clicking the checkbox
  toggles and saves immediately, with no explicit edit step.

### 7.3 Editor types (driven by `meta.inputType`)

- `text` — auto-expanding `Textarea`.
- `number` — numeric `Input`.
- `boolean` — interactive `Checkbox`.
- `select` — `Select` dropdown populated from `meta.selectOptions`.

### 7.4 Commit / cancel / navigation

- **Enter** commits (in a textarea, Enter commits; Shift+Enter inserts a
  newline).
- **Escape** cancels and restores the original value.
- **Blur** (clicking outside the cell) commits.
- **Tab** commits the current edit and moves focus to the next editable cell in
  the row; **Shift+Tab** moves to the previous editable cell.
- While a save promise is pending and while `isSubmitting` is true, editors and
  selection checkboxes are disabled to prevent concurrent edits.

### 7.5 Editing state shape

Track at most one cell in edit mode at a time:

```ts
type EditingState = {
  rowId: string | number
  columnId: string
  initialValue: string
} | null
```

Provide a helper that extracts a cell's editable string value:
`getCellEditValue(row, columnId)` returns `String(value)` or `''` for null/undefined.

---

## 8. Frozen (Pinned) Columns

- `frozenColumns: number` pins that many *leading* columns.
- Implement as a **split layout**: a sticky, left-aligned **pinned pane**
  containing the first N columns, and a horizontally-scrollable **scroll pane**
  for the rest.
- The pinned pane width is capped at `FROZEN_PANE_MAX_FRACTION` (50%) of the
  viewport so it can never crowd out the scrollable area on narrow screens.
- Horizontal scroll position is synchronized so header, body, and footer scroll
  together; the pinned pane never scrolls horizontally.
- When row selection is enabled, the injected selection column is pinned
  alongside the frozen columns (see §11).

---

## 9. Sorting

- Single-column sort by default: clicking a sortable header cycles
  asc → desc → none.
- `enableMultiSort` enables shift-click multi-column sort. When active, each
  sorted header shows a small numeric priority badge indicating sort order.
- Header cells render an up/down arrow indicating direction.
- `initialSorting: SortingState` sets the default sort on mount (uncontrolled).
- Sorting respects nested rows: sub-rows sort within their parent (see §19).

---

## 10. Filtering

### 10.1 Per-column filter popover

- Each filterable header shows a filter affordance opening a popover.
- The popover supports two combined mechanisms:
  - **Text search** — case-insensitive "includes" match.
  - **Faceted checklist** — a (virtualized) list of the column's unique values,
    each toggleable. Selecting a subset restricts to those values.
- The per-column filter value shape:

  ```ts
  type ColumnFilterValue = { text: string; checkedValues: Set<string> | null }
  ```

### 10.2 Filter state & badges

- Filter state uses the library's `ColumnFiltersState` and may be controlled via
  `columnFilters` + `onColumnFiltersChange`, or left uncontrolled.
- Active filters render as removable badges above the grid: each badge clears its
  own filter, plus a "clear all" affordance.

### 10.3 Header responsiveness

- The header observes its own width (via `ResizeObserver`) and hides the filter
  icon below ~56px and the sort icon below ~100px so shrinking columns degrade
  gracefully rather than overflow.

---

## 11. Row Selection

- `enableRowSelection` injects a leading checkbox column at index 0 (pinned with
  the frozen columns). The header checkbox is select-all / clear-all for the
  currently-filtered rows.
- Bridge the library's `RowSelectionState` (keyed object) to a flat id list:
  - Controlled: `selectedRowIds: string[]` + `onSelectedRowIdsChange(ids)`.
  - Uncontrolled: internal state, still surfaced via the change callback.
- Selection is keyed by `getRowId`, so in a `TabbedTable` the same selection is
  shared across tabs automatically.
- Checkboxes expose `aria-label="Select row"` and `aria-label="Select all rows"`.
- For nested rows, define parent/child selection semantics (§19.6).

---

## 12. Column Visibility Picker

- `enableColumnVisibility` renders a toolbar dropdown listing hideable columns
  with toggle checkboxes.
- Frozen columns, columns with `enableHiding: false`, and (when column groups are
  used) all columns are excluded from the picker.
- Hidden-column sets persist to `localStorage` under `columnVisibilityStorageKey`.
- When a column is hidden, any column-group colspans must be recomputed so group
  headers stay aligned.

---

## 13. Virtualization

### 13.1 Row virtualization

- Use a vertical virtualizer with fixed `ROW_HEIGHT_PX`. Only rows within (and a
  small overscan around) the viewport are mounted. Use `getRowId` for stable
  keys.

### 13.2 Column virtualization (scroll pane only)

- The pinned pane renders all its (few) columns. The scroll pane is column-
  virtualized manually: from `scrollLeft`, the cumulative column widths, and the
  pane width, compute the visible column index range (with overscan) and render
  only those, offset by the leading columns' total width.
- The frozen pane is never column-virtualized.

### 13.3 Pagination

- The system is virtualization-first; there is no discrete pagination. (If a
  consumer wants pages, they slice `data` upstream.)

---

## 14. Auto Column Widths ("pretext" measurement)

Column widths are computed *before* the table paints, to eliminate layout shift:

- Implement an off-screen text-measurement utility (canvas `measureText` or an
  equivalent DOM-free measurer) that, given a string and the table's font
  metrics, returns its pixel width.
- For each column, sample the data (header label + a bounded sample of cell
  values) and compute the natural content width:
  - Use `meta.measureText(row)` when the cell renders non-text content.
  - Use `meta.fixedMeasureWidth` to skip measurement entirely.
  - Add cell chrome (horizontal padding, sort/filter icon allowances) on top.
  - Clamp to `[measured header width, meta.maxColumnWidth ?? systemMax]`.
- The measured header width (label + sort/filter buttons) is the *real* per-
  column minimum; `MIN_COLUMN_WIDTH_PX` is only a fallback used until measurement
  resolves, and `ABSOLUTE_MIN_COLUMN_WIDTH_PX` only guards the empty-header case.
- Expose an injectable measurement function (`measure?`) so tests can pass a
  deterministic stub.

---

## 15. Column Resizing

- `enableResizing` (per column) plus a drag handle on the header border lets the
  user resize. A manual resize overrides the auto-computed width for that column.
- Resize handles expose `role="separator"` and are keyboard operable.

---

## 16. Footer / Totals Row

- `enableFooter` renders a footer row aligned to the columns (and frozen panes).
- Each column's footer is driven by `meta`:
  - `footerAggregate` computes `sum | avg | min | max | count` over the
    **currently-filtered** rows (numeric aggregates ignore non-numeric values;
    `count` tallies non-empty).
  - `footerFormat` formats the computed number; defaults to `toLocaleString()`.
  - `footerLabel` renders static text when no aggregate is set (e.g. a "Totals"
    label in the first column).
- The footer scrolls horizontally in sync with the header and body.

---

## 17. States: Loading / Empty / Submitting

- `isLoading` → render a skeleton that mirrors the grid layout (animated
  placeholder bars at the right column widths and row height).
- Empty (no rows after filtering) → render `emptyMessage`, defaulting to
  "No results found".
- `isSubmitting` → disable selection checkboxes and all cell editors to prevent
  concurrent mutation while a save is in flight.

---

## 18. Tabbed Tables

`TabbedTable` presents the *same* row data under multiple tabs, each with its own
column set, and unifies filtering/selection across them.

### 18.1 Tab configuration

```ts
type CommonTab<TRow> = {
  id: string                 // stable tab key
  label: string              // button text + filter-badge source label
  columns: ColumnDef<TRow>[] // column set shown on this tab
  frozenColumns?: number
  initialSorting?: SortingState
  columnVisibilityStorageKey?: string
  columnLabel?: (columnId: string) => string
}

type ReadOnlyTab<TRow> = CommonTab<TRow> & { editable?: false }

type EditableTab<TRow> = CommonTab<TRow> & {
  editable: true
  editableColumnIds: string[]
  onSaveEdit: (row, columnId, value) => Promise<boolean>
  columnGroups?: ColumnGroupDef[]
  singleClickEdit?: boolean
  getCellClassName?: (row, columnId) => string | undefined
  isSubmitting?: boolean
}

type TabbedTableTab<TRow> = ReadOnlyTab<TRow> | EditableTab<TRow>
```

Each tab may independently be read-only or editable.

### 18.2 TabbedTable props

```ts
type TabbedTableProps<TRow> = {
  data: TRow[]
  getRowId: (row: TRow) => string | number
  idColumn: string            // stable column shared by all tabs; drives cross-tab
                              // filter intersection. Must be the column getRowId reads.
  tabs: TabbedTableTab<TRow>[]
  activeTabId?: string         // controlled active tab
  defaultTabId?: string        // initial active tab when uncontrolled
  onActiveTabChange?: (id: string) => void
  actions?: React.ReactNode    // right-aligned tab-strip controls (refresh/export…)
  emptyMessage?: string
  isLoading?: boolean
  columnVisibilityStorageKeyBase?: string  // each tab persists under `${base}:${tab.id}`
  tabIndicatorLayoutId?: string            // distinct per mounted TabbedTable
  measure?: MeasureTextFn
} & Pick<AdvancedFeatures,
  'enableMultiSort' | 'enableRowSelection' | 'selectedRowIds'
  | 'onSelectedRowIdsChange' | 'enableColumnVisibility' | 'enableFooter'>
```

### 18.3 Cross-tab shared filtering (the key feature)

- Each tab keeps its own `ColumnFiltersState`.
- A shared hook intersects the matching row-id sets across all tabs by
  `idColumn`: the displayed rows are the **intersection** of the rows passing
  each tab's filters. So a filter applied on Tab A narrows Tab B even when Tab B
  doesn't display Tab A's filtered column.
- Removable filter badges are rendered across the whole component; clearing a
  badge updates the originating tab's filter state.

### 18.4 Layout & tab strip

- The tab strip, the optional `actions` slot, the built-in column picker (when
  enabled), and the grid all live in **one** bordered container. The inner tables
  render without their own border (`bordered={false}`).
- Place `TabbedTable` inside a bounded flex column so its tables size in
  flex-fill mode (no `maxHeight`).

### 18.5 Tab transition animation (frozen columns stay static)

- Switching tabs slides the panels horizontally with Framer Motion: the entering
  panel slides in from ±100% and the exiting panel slides out, direction chosen
  by whether the new tab index is greater (+1) or lesser (−1).
- **The frozen/pinned pane must NOT slide.** Achieve this by feeding the pinned
  pane an x-offset motion value equal to the *negation* of the panel's slide
  translate, cancelling the parent motion so pinned columns appear static while
  the scrollable columns slide.
- The mid-slide entering panel must render fully opaque (no fade-in) during the
  slide; a semi-transparent panel would let the other panel's moving columns show
  through the pinned pane. Fade-in is therefore disabled for panels that mount
  mid-slide and enabled otherwise.

---

## 19. NEW REQUIREMENT — Nested Rows

Add hierarchical (parent → child) rows with expand/collapse, working with all
existing features.

### 19.1 Data & API

- Support a sub-rows accessor: `getSubRows?: (row: TRow) => TRow[] | undefined`.
  A row with sub-rows is a *parent*; its sub-rows may themselves have sub-rows
  (arbitrary depth).
- Expansion is controllable and uncontrollable:
  - `expanded?: Record<string, boolean>` + `onExpandedChange?`.
  - `defaultExpanded?: boolean | Record<string, boolean>` (`true` expands all).
- `enableExpanding` turns the feature on. When off, `getSubRows` is ignored and
  data renders flat.

### 19.2 Expand/collapse control

- Parent rows render a disclosure toggle (chevron) in their **first non-selection
  column**, indented by depth. The chevron rotates with an animated transition on
  expand/collapse.
- Toggling a parent shows/hides its direct children. Collapsing a parent hides
  the entire subtree (descendants stay collapsed in their own remembered state).
- Provide an "expand all / collapse all" affordance in the toolbar when
  `enableExpanding` is on.

### 19.3 Indentation & depth

- Indent the disclosure column content by `depth * INDENT_STEP_PX`
  (recommend `INDENT_STEP_PX = 20`). Indentation is part of that column's
  measured width (factor depth into auto-sizing for the disclosure column).
- All rows keep the fixed `ROW_HEIGHT_PX`; nesting changes horizontal indent,
  not row height.

### 19.4 Interaction with virtualization

- Only **visible** rows (parents + expanded descendants) participate in the
  flattened, virtualized row model. Collapsed subtrees contribute zero rows to
  the virtualizer. Expanding/collapsing updates the flattened list and the
  virtualizer recomputes offsets — no manual height math, no timing hacks.

### 19.5 Interaction with sorting & filtering

- **Sorting** applies within each parent's children (siblings sort among
  themselves); parent order sorts among parents. Depth/structure is preserved.
- **Filtering** keeps a parent visible if the parent matches *or* any descendant
  matches; non-matching descendants of a matching parent are hidden. A parent
  shown only because a descendant matched is auto-expanded to reveal the match.
- **Cross-tab shared filtering** (§18.3) intersects by `idColumn` using the
  parent's id; define and document whether sub-rows carry their own ids that
  participate in intersection (recommended: sub-rows have their own stable ids
  and participate).

### 19.6 Interaction with selection

- Provide parent/child selection semantics: selecting a parent selects all
  descendants; deselecting clears them. A parent whose descendants are partially
  selected shows an **indeterminate** checkbox. `onSelectedRowIdsChange` emits the
  full flattened set of selected ids.

### 19.7 Interaction with frozen columns & footer

- The disclosure toggle lives in the (frozen) first content column, so it remains
  visible while scrolling horizontally.
- Footer aggregates compute over the currently-visible **leaf** rows by default;
  document this choice. (Optionally allow aggregating only top-level rows via a
  flag, but leaf-by-default is the spec.)

---

## 20. NEW REQUIREMENT — Action Buttons in Any Arbitrary Cell

Allow interactive action buttons inside **any** cell, independent of edit mode,
without breaking selection, editing, sorting, or auto-sizing.

### 20.1 API

Add to column `meta`:

```ts
type CellAction<TRow> = {
  id: string
  // Label and/or icon. At least one is required; icon-only buttons must set
  // ariaLabel.
  label?: string
  icon?: React.ReactNode
  ariaLabel?: string
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive' | 'outline'
  // Click handler. Receives the row and is given the original DOM event so the
  // implementation can stop propagation. May be async.
  onClick: (row: TRow, event: React.MouseEvent) => void | Promise<void>
  // Per-row dynamic state:
  isHidden?: (row: TRow) => boolean
  isDisabled?: (row: TRow) => boolean
  // Optional confirm step before firing onClick (e.g. for destructive actions).
  confirm?: { title: string; description?: string; confirmLabel?: string }
  // Optional tooltip.
  tooltip?: string
}

// in TableColumnMeta:
actions?: CellAction<Record<string, unknown>>[]
```

A column may also render actions via its own `cell` renderer; the `meta.actions`
array is the declarative shortcut and must be supported. Both approaches must
coexist with the value display (actions can sit beside text in the same cell).

### 20.2 Behavior & event handling

- Action buttons render inside the cell, right-aligned by default, after any
  value content.
- **Click isolation is mandatory.** A button click must `stopPropagation` so it
  never triggers row selection, row expansion, or cell edit mode. Likewise it
  must not start a column sort or open a filter (it's in the body, not the
  header, but guard regardless).
- `isHidden(row)` removes the button for that row; `isDisabled(row)` renders it
  disabled (and non-interactive).
- If `confirm` is set, clicking opens a confirm dialog/popover and only fires
  `onClick` on confirmation.
- While an async `onClick` is pending, show a busy state on that specific button
  and prevent re-entry; respect the table's `isSubmitting`.

### 20.3 Accessibility

- Every action button is keyboard-focusable and operable with Enter/Space.
- Icon-only buttons require `ariaLabel`. Provide tooltips via `tooltip`.
- Focus order follows visual order within the row; actions come after editable
  cells in tab order.

### 20.4 Interaction with auto-sizing & frozen columns

- The action column's width must account for the rendered buttons. Since buttons
  aren't plain text, callers set `meta.fixedMeasureWidth` (preferred for icon
  buttons) or `meta.measureText` returning a representative label string;
  otherwise the system estimates from labels. Document that an unsized action
  column may be too narrow and that `fixedMeasureWidth` is the reliable path.
- Action buttons work in frozen columns and in virtualized scroll columns
  identically.

### 20.5 Interaction with editing & nested rows

- In an editable table, a cell may contain both an editable value and actions;
  entering edit mode must not hide the actions unless the column's renderer
  chooses to. A single click on an action never enters edit mode (§20.2).
- On nested rows, actions may differ by depth via `isHidden`/`isDisabled`
  inspecting the row; the disclosure toggle and actions must not overlap (render
  the toggle first, value next, actions last).

---

## 21. Styling, Responsiveness, Accessibility (cross-cutting)

- **Styling:** Tailwind utility classes; theme-aware (light/dark). Use semantic
  table primitives for structure. Provide a custom thin scrollbar for the
  virtualized scroll container.
- **Bordered chrome:** `bordered` (default true) draws the table's own border +
  rounded corners; set false when an outer container supplies chrome (TabbedTable
  uses this for its inner tables).
- **Animations (general policy):** elements animate in/out and on change — cards
  fade/slide in, dropdowns slide open/closed, the edit affordance fades in,
  chevrons rotate, tab panels slide. Never use timing-based hacks
  (`setTimeout(0)`, `requestAnimationFrame` polling) to coordinate animation or
  DOM readiness; drive everything from state, `useLayoutEffect` for post-render
  DOM reads, and callback refs.
- **Responsive:** header hides filter/sort icons as columns shrink (§10.3);
  frozen pane capped at 50% width; auto-sizing prevents overflow.
- **Accessibility:** sortable headers are `role="button"`, `tabIndex={0}`, and
  keyboard-activatable; resize handles are `role="separator"`; selection
  checkboxes carry aria-labels; editors support Enter/Escape/Tab; action buttons
  are fully keyboard operable.

---

## 22. Data, Dates & Serialization

- Data is passed in via the `data` prop (commonly fetched with a query library
  upstream). The table does not fetch.
- **Date-only values** must format and parse safely to avoid timezone off-by-one
  errors. Provide and use:
  - `formatDateSafe(value)` → display string (reference format `MM/dd/yyyy`).
  - `parseDateSafe(value)` → parses `"YYYY-MM-DD"` (interpreted at midnight UTC)
    without shifting the day in local time.
  - Never do `format(new Date(value), …)` directly on date-only strings.
- If rows come from a backend that emits non-JSON-native types (big integers,
  decimals, dates), serialize them to JSON-safe primitives before they reach the
  table.

---

## 23. Public API Summary

### ReadOnlyTable

```ts
type ReadOnlyTableProps<TRow> = {
  data: TRow[]
  columns: ColumnDef<TRow>[]
  getRowId: (row: TRow) => string | number
  toolbar?: React.ReactNode
  maxHeight?: string
  emptyMessage?: string
  isLoading?: boolean
  bordered?: boolean
  frozenColumns?: number
  columnFilters?: ColumnFiltersState
  onColumnFiltersChange?: Dispatch<SetStateAction<ColumnFiltersState>>
  initialSorting?: SortingState
  measure?: MeasureTextFn
} & AdvancedFeatureProps
```

### EditableTable

`ReadOnlyTableProps` plus:

```ts
  editableColumnIds: string[]
  onSaveEdit: (row, columnId, value: string | number) => Promise<boolean>
  isSubmitting?: boolean
  singleClickEdit?: boolean
  columnGroups?: ColumnGroupDef[]
  getCellClassName?: (row, columnId) => string | undefined
```

### AdvancedFeatureProps (shared, all default off)

```ts
type AdvancedFeatureProps = {
  enableMultiSort?: boolean
  enableRowSelection?: boolean
  selectedRowIds?: string[]
  onSelectedRowIdsChange?: (ids: string[]) => void
  enableColumnVisibility?: boolean
  columnVisibilityStorageKey?: string
  enableFooter?: boolean
  // Nested rows (NEW)
  enableExpanding?: boolean
  getSubRows?: (row) => row[] | undefined
  expanded?: Record<string, boolean>
  onExpandedChange?: (next: Record<string, boolean>) => void
  defaultExpanded?: boolean | Record<string, boolean>
}
```

### TabbedTable

See §18.2.

---

## 24. Worked Example

```tsx
const columns: ColumnDef<Facility>[] = [
  { id: 'name', header: 'Company Name', accessorKey: 'name',
    meta: { footerLabel: 'Totals' } },

  { id: 'dba', header: 'DBA', accessorKey: 'dba',
    meta: { editable: true, inputType: 'text', maxColumnWidth: 300 } },

  { id: 'beds', header: 'Beds', accessorKey: 'beds',
    meta: { editable: true, inputType: 'number', footerAggregate: 'sum' } },

  { id: 'isActive', header: 'Active', accessorKey: 'isActive',
    meta: { editable: true, inputType: 'boolean', footerAggregate: 'count' } },

  // Arbitrary action buttons in a cell (NEW)
  { id: 'actions', header: '', enableSorting: false, enableColumnFilter: false,
    meta: {
      fixedMeasureWidth: 96,
      actions: [
        { id: 'view', icon: <EyeIcon/>, ariaLabel: 'View',
          onClick: (row) => openDrawer(row) },
        { id: 'delete', icon: <TrashIcon/>, ariaLabel: 'Delete',
          variant: 'destructive',
          confirm: { title: 'Delete facility?', confirmLabel: 'Delete' },
          isDisabled: (row) => row.isActive === true,
          onClick: async (row) => { await remove(row.id) } },
      ],
    } },
]

<EditableTable
  data={data}
  columns={columns}
  getRowId={(r) => r.id}
  frozenColumns={1}
  editableColumnIds={['dba', 'beds', 'isActive']}
  onSaveEdit={async (row, colId, val) => updateApi(row.id, { [colId]: val })}
  singleClickEdit
  enableRowSelection
  enableFooter
  enableExpanding
  getSubRows={(r) => r.children}   // nested rows (NEW)
/>
```

---

## 25. Acceptance Checklist

A correct implementation satisfies all of:

- [ ] Three wrappers over one shared engine; advanced features default off.
- [ ] Generic over `TRow`; stable `getRowId` everywhere.
- [ ] Row + scroll-pane column virtualization; smooth at 10k rows / 50 cols.
- [ ] Frozen leading columns, capped at 50% width, static during tab slide.
- [ ] Pre-paint auto column widths via off-screen measurement (no layout shift),
      with `measureText` / `fixedMeasureWidth` / `maxColumnWidth` honored.
- [ ] Inline editing: text/number/boolean/select, Enter/Escape/Blur/Tab nav,
      async `onSaveEdit` gating, single- and double-click modes.
- [ ] Single + multi-column sort with order badges.
- [ ] Per-column filter popover (text + faceted), removable badges, controlled
      filter state.
- [ ] Row selection (controlled/uncontrolled), select-all, aria-labels.
- [ ] Column visibility picker with localStorage persistence.
- [ ] Footer aggregates (sum/avg/min/max/count) + static labels over filtered
      rows.
- [ ] Loading skeleton, empty message, submitting lockout.
- [ ] TabbedTable: per-tab columns, cross-tab `idColumn` filter intersection,
      shared selection, slide animation with static pinned pane.
- [ ] **Nested rows:** expand/collapse, indentation, virtualization-aware,
      sort/filter/selection/footer semantics defined in §19.
- [ ] **Cell action buttons:** declarative `meta.actions`, click isolation,
      hidden/disabled/confirm/busy states, accessibility, sizing.
- [ ] Date-safe formatting/parsing; no timezone off-by-one.
- [ ] No `setTimeout(0)` / `requestAnimationFrame` timing hacks anywhere.
- [ ] Full keyboard accessibility across headers, editors, selection, actions.
- [ ] Supports both SSR and Client Rendering.
- [ ] Uses the minimal amount of npm packages necessary, with the only required package being `@chenglou/pretext` for text measuring.
- [ ] Has a public API to support visual customization.