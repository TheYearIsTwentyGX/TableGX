# Column jump shortcut (Ctrl+G / Cmd+G)

## Overview

Add a keyboard shortcut that opens a searchable "jump to column" dialog. The
user types a column name, picks it (via mouse or arrow keys + Enter), and the
table switches to whichever tab holds that column (if any) and scrolls it into
view. Applies uniformly to every table surface the library exports:
`ReadOnlyTable`, `EditableTable`, `TableGX` (`variant="table"`), `TabbedTable`,
and `IndependentTabbedTable`.

## Goals

- Ctrl+G (Windows/Linux) or Cmd+G (Mac) opens the dialog whenever focus is
  somewhere inside a given table instance.
- The dialog lists every column across every tab (for tabbed tables) or just
  the one table's columns (for plain tables), filterable by a case-insensitive
  substring match, navigable with Up/Down + Enter, dismissible with Escape or
  an overlay click.
- Selecting an entry switches to the correct tab (if needed) and scrolls the
  column into view.
- Hidden columns are included in the list by default (a new prop lets
  consumers exclude them instead); selecting a hidden column un-hides it.
- Opt-in, default off, so it never changes behavior for existing consumers.

## Non-goals

- No fuzzy/typo-tolerant matching — plain substring matching only for v1.
- No customizable key binding — Ctrl+G / Cmd+G is fixed.
- No cross-*table* jump (only cross-*tab*, within one `TabbedTable` /
  `IndependentTabbedTable` instance).

## Why this lives in `TableCore`, not the tab store

`ReadOnlyTable` and `EditableTable` are thin wrappers that spread their props
straight into `TableCore` with no tab store at all
(`src/components/ReadOnlyTable.tsx`, `src/components/EditableTable.tsx`).
`TabbedTable` and `IndependentTabbedTable` are compositions over a headless
store (`src/primitives/store.tsx`) that mounts exactly one tab's `TableCore` at
a time (`src/primitives/TablePanels.tsx`). Since `TableCore` is the one thing
every surface has in common, the shortcut listener, the dialog, and the
own-column scroll logic all live in `TableCore`. The tab store's only job is
to bridge "the column the user picked belongs to a *different* tab."

## Public API additions

**`AdvancedFeatureProps<TRow>`** (`src/types.ts`) — inherited by
`ReadOnlyTableProps`, `EditableTableProps`, and `TableGXTableProps`
automatically:

```ts
enableColumnJump?: boolean          // default false
columnJumpIncludeHidden?: boolean   // default true
```

**`TabbedTableProps<TRow>`** — add `'enableColumnJump' | 'columnJumpIncludeHidden'`
to the existing `Pick<AdvancedFeatureProps<TRow>, ...>` list, so it stays
DRY with the single-table props.

**`IndependentTabbedTableProps`** (`src/components/IndependentTabbedTable.tsx`)
— this type is hand-written, not derived from `AdvancedFeatureProps`, so add
the same two fields directly, matching the existing `enableTabColumnPreview`
convention already used there.

**`TableClassNames`** (`src/types.ts`) — add `columnJumpDialog?: string` for
style overrides (mirrors `tabColumnPreview?: string` on
`TabbedTableClassNames`).

No new public types need exporting from `src/index.ts` — the bridging type
(`ColumnJumpEntry`, see below) is internal plumbing between the store and
`TableCore`, never handed to consumer callbacks.

## Internal data model

New internal type (`src/primitives/types.ts` or `src/types.ts`, not exported
publicly):

```ts
type ColumnJumpEntry = {
  columnId: string
  label: string
  hidden: boolean
  /** Present only for entries that belong to a different tab than the one
   *  currently rendering the dialog. Absent for a table's own columns. */
  tabId?: string
  tabLabel?: ReactNode
}
```

`TableTabModel` (`src/primitives/types.ts`) gains a new field, built the same
way `columnPreviewLabels` already is (`src/components/TabbedTable.tsx`,
`independentTable()` in `src/components/IndependentTabbedTable.tsx`), but
carrying ids instead of just label strings, and gated on `enableColumnJump`
instead of `enableTabColumnPreview`:

```ts
columnJumpItems: { id: string; label: string }[]
```

`TableProviderConfig` gains `columnJumpIncludeHidden?: boolean` (default
`true`) — this must live in the store (not the static tab model) because
"hidden" depends on live, per-tab visibility state that only the store tracks.

`TableBodyRenderArgs` gains four fields, populated by the store and forwarded
by each tab's `render` closure into that tab's `TableCore` call:

```ts
columnJumpForeignEntries?: ColumnJumpEntry[]
onJumpToForeignColumn?: (entry: ColumnJumpEntry) => void
scrollToColumnId?: string | null
onScrollToColumnHandled?: () => void
```

## `TableCore` behavior

New props: `enableColumnJump?`, `columnJumpIncludeHidden?` (default `true`),
`columnJumpForeignEntries?`, `onJumpToForeignColumn?`, `scrollToColumnId?`,
`onScrollToColumnHandled?` — all optional, all `undefined`/no-op for
`ReadOnlyTable`/`EditableTable` callers, which only ever set the first two.

1. **Shortcut.** An `onKeyDown` handler on `TableCore`'s outer wrapper div
   checks `(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g'`, calls
   `preventDefault()`, and opens the dialog (local `useState`). Because this
   is a plain React `onKeyDown` (not a `document` listener), it only fires
   once focus has bubbled up from somewhere inside this specific table
   instance — multiple tables on a page never contend for the shortcut, and
   nothing fires before the user has interacted with the table at all.

2. **Own entries.** Built from the TanStack `table` instance's leaf columns
   (already available inside `TableCore`), using the existing `columnLabel`
   prop for labels and `column.getIsVisible()` for the hidden flag — no new
   visibility bookkeeping needed. Excludes synthetic columns (the row-selection
   checkbox column, the expand-toggle column) via `column.columnDef.enableHiding
   !== false`, the same filter `ColumnVisibilityPicker`'s `getPickerItems`
   already uses for the same purpose (both synthetic columns set
   `enableHiding: false`). Filtered out entirely when
   `columnJumpIncludeHidden === false` and hidden. These entries carry no
   `tabId`.

3. **Merged list.** `[...ownEntries, ...(columnJumpForeignEntries ?? [])]`,
   sorted alphabetically by label, handed to the dialog. For plain tables
   `columnJumpForeignEntries` is `undefined`, so the list is just the table's
   own columns.

4. **Selecting an entry:**
   - No `tabId` (own column): un-hide via
     `table.getColumn(columnId)?.toggleVisibility(true)` if hidden, compute
     its offset from the existing column-width/offset machinery already used
     for rendering (`widthOf`/`colOffsets`/`pinnedWidth` in
     `src/core/TableCore.tsx`), skip scrolling if the column is inside the
     frozen/pinned pane (already always visible), otherwise
     `scrollRef.current.scrollTo({ left, behavior: 'smooth' })`. Close the
     dialog.
   - Has a `tabId` (foreign column): call `onJumpToForeignColumn(entry)` and
     close the dialog immediately. The actual scroll happens later, once the
     target tab's `TableCore` mounts (see below).

5. **External scroll requests.** An effect watching `scrollToColumnId`: if it
   is set and matches one of this instance's own leaf column ids, run the
   same un-hide + scroll steps as step 4's own-column path, then call
   `onScrollToColumnHandled()` to let the store clear the pending id. If it
   doesn't match (e.g. this `TableCore` is not the intended target yet),
   nothing happens.

## Store bridging (`src/primitives/store.tsx`)

- Computes, per tab, live `ColumnJumpEntry[]` by combining each tab's static
  `columnJumpItems` with that tab's current visibility (`getVisibility`,
  already private to the store).
- For the *active* tab, derives `columnJumpForeignEntries` as every other
  tab's entries (each carrying its `tabId`/`tabLabel`), exposed via
  `getBodyArgs`.
- New state `pendingScrollColumnId: string | null`.
- `jumpToForeignColumn(entry)`: if `entry.hidden`, sets that column visible on
  the target tab via the existing `setVisibility` closure; calls the existing
  `selectTab(entry.tabId)`; sets `pendingScrollColumnId = entry.columnId`.
  Exposed via `getBodyArgs` as `onJumpToForeignColumn`.
- `getBodyArgs` also passes `scrollToColumnId: pendingScrollColumnId` and
  `onScrollToColumnHandled: () => setPendingScrollColumnId(null)` — since only
  the active tab's `TableCore` is ever mounted (`TablePanels.tsx`), the
  `TableCore` that mounts right after the tab switch is exactly the one that
  will see this id and act on it.

This mirrors the existing pattern for `sorting`/`search`/`selection` in the
store: state lives centrally, `getBodyArgs` fans it out per-render to
whichever tab is currently rendering.

## `TabbedTable.tsx` / `IndependentTabbedTable.tsx` wiring

Both components:
- Destructure `enableColumnJump`, `columnJumpIncludeHidden` from their props.
- Build each tab's `columnJumpItems` the same way `columnPreviewLabels` is
  built today (map over hideable columns, resolve id + label), gated on
  `enableColumnJump` (empty array when disabled, matching the existing
  `enableTabColumnPreview` gating idiom).
- Pass `columnJumpIncludeHidden={columnJumpIncludeHidden ?? true}` into
  `<Table.Provider>`.
- In each tab's `render`, forward `enableColumnJump`, `columnJumpIncludeHidden`,
  and the four bridging fields from `args` straight into that tab's
  `<TableCore>` call — the same passthrough pattern already used for
  `controlledSorting`/`onControlledSortingChange` etc.

## Dialog UI

No general-purpose modal exists yet (only `alert-dialog.tsx`, which is
semantically a confirm/cancel dialog). Add:

- `src/ui/dialog.tsx` — a thin wrapper around `@radix-ui/react-dialog`
  (new dependency), following the exact structural pattern of
  `src/ui/alert-dialog.tsx`: `Dialog`, `DialogTrigger`, `DialogPortal`,
  `DialogOverlay`, `DialogContent`, `DialogTitle` (visually hidden — the
  search input is the real affordance), `DialogDescription`.
- `src/core/ColumnJumpDialog.tsx` — the feature component:
  - Props: `open`, `onOpenChange`, `entries: ColumnJumpEntry[]`,
    `onSelect: (entry) => void`, `className?`.
  - An autofocused `Input` (existing `src/ui/input.tsx`) at the top; query
    resets on close.
  - A scrollable list below (`tgx-scrollbar max-h-* overflow-y-auto`,
    matching `ColumnVisibilityPicker`'s list styling) of entries matching the
    query (case-insensitive substring against `label`), each row showing the
    column label, a small secondary tab-name badge when `entry.tabId` is set
    and more than one distinct tab appears in the list, and a muted
    "hidden"-style indicator (`EyeOffIcon` from `lucide-react`, already a
    dependency) when `entry.hidden`.
  - Keyboard handling on the input: `ArrowDown`/`ArrowUp` move a highlighted
    index (clamped, wrapping optional — clamp is simpler and sufficient),
    `Enter` selects the highlighted row, `Escape` closes. Mouse click on a row
    selects it directly regardless of highlight state.
  - Empty-query state shows the full alphabetized list; no-match state shows
    a small "No columns match" message.

## Edge cases

- **Column present on multiple tabs (shared-dataset `TabbedTable`).** Each tab
  that renders the column contributes its own entry, disambiguated by the
  tab-name badge. Selecting the entry for the tab you're already on just runs
  the own-column scroll path (no tab switch).
- **Selecting the currently active tab's own hidden column.** Handled by step
  4's own-column path directly — no store round-trip needed.
- **Rapid re-selection before a previous jump settles.** `pendingScrollColumnId`
  is simply overwritten; the newly-mounted `TableCore` only ever acts on the
  latest value.
- **`enableColumnJump` false (default).** `columnJumpItems` stays empty on
  every tab model, `TableCore` never attaches the listener or entries list —
  zero behavioral change for existing consumers.

## Testing

New test file `test/columnJump.test.tsx` covering:
- Ctrl+G / Cmd+G opens the dialog only when focus is inside the table
  (`ReadOnlyTable` case); a keydown dispatched outside the table does nothing.
- Typing filters the list case-insensitively; Up/Down + Enter selects.
- Selecting a hidden column un-hides it and scrolls (assert `scrollTo` called
  with a computed offset, or that the column's visibility flips — exact
  assertion mechanics to be decided in the implementation plan given
  `jsdom`'s lack of real layout).
- `columnJumpIncludeHidden={false}` excludes hidden columns from the list.
- `TabbedTable`: selecting a foreign-tab column switches the active tab and
  the newly-mounted tab's table receives the scroll request.
- `enableColumnJump` unset/false: no listener attached, no dialog ever opens.
