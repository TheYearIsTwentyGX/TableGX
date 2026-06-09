# TSTabbedTable tab bar — folder-tab styling reference

Self-contained reference for reproducing the `TSTabbedTable` "browser/folder tab"
look on a different table component, without reverse-engineering the original.
The live source is `src/components/table/TSTabbedTable.tsx` (the tab strip is the
`return (...)` block around lines 496–544); the theme tokens come from
`src/styles.css` (`:root` light, `.dark` dark).

The visual goal: the **active** tab looks like a folder tab fused to the grid
below it — its bottom border disappears so the tab and the table read as one
continuous surface, with a thin primary accent line sliding between tabs as the
selection changes.

## 1. Structure (outer → inner)

### a. Shared bordered container

The grid and its tab strip live inside one rounded, bordered card. The active
tab's background must match this card so the seam between tab and grid vanishes.

```jsx
<div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden rounded-md border bg-card">
  {/* tab strip + grid go here */}
</div>
```

### b. Tab strip row

A horizontal strip with a **bottom border** (`border-b border-border`) and a
faint muted background (`bg-muted/40`). The bottom border is what the active tab
later "covers" to create the folder-tab merge. Actions are right-aligned via
`justify-between`.

```jsx
<div className="shrink-0 flex items-stretch justify-between gap-3 border-b border-border bg-muted/40 pr-2">
  <div className="flex items-end">
    {/* tab buttons */}
  </div>
  {/* optional right-aligned actions / column picker */}
</div>
```

`items-end` keeps the buttons sitting on the strip's bottom edge so their
`-mb-px` can pull them down onto the border line.

### c. Per-tab button

Each tab is a `<button>` with three class groups: **shared** (always applied),
plus an **active** OR **inactive** set swapped on `isActive`.

```jsx
<button
  type="button"
  onClick={() => selectTab(tab.id)}
  className={`relative -mb-px rounded-t-md border-x border-t px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
    isActive
      ? 'border-border bg-card text-foreground'
      : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground'
  }`}
>
  {/* border-cover span (active only) */}
  {/* accent indicator (active only) */}
  <span className="relative z-10">{tab.label}</span>
</button>
```

- **Shared:** `relative -mb-px rounded-t-md border-x border-t px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors`
  - `border-x border-t` (no `border-b`) draws only the three sides a folder tab needs.
  - `-mb-px` pulls the button down by 1px so its bottom edge overlaps the strip's bottom border.
  - `rounded-t-md` rounds only the top corners.
- **Active:** `border-border bg-card text-foreground` — visible border, card-colored fill (matches the grid), full-strength text.
- **Inactive:** `border-transparent bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground` — no border/fill, muted text, with a muted hover wash and full-strength hover text.

### d. The 1px "border-cover" span (active only)

The strip has a bottom border; the active tab needs to *erase* the 1px of it
that runs under the tab so the tab and grid look joined. A card-colored 1px span
sits just below the tab, painting over that border segment.

```jsx
{isActive && (
  <span aria-hidden className="absolute inset-x-0 -bottom-px h-px bg-card" />
)}
```

- `-bottom-px` positions it exactly on the strip's border line.
- `h-px` + `bg-card` repaints that single pixel row in the grid/card color.

### e. The framer-motion sliding accent indicator (active only)

A primary-colored line on the bottom edge of the active tab. Because every
active tab renders a `motion.span` with the **same `layoutId`**, framer-motion
animates it sliding from the old tab to the new one on selection change. It's a
square bar on the bottom edge (no rounding) to avoid corner jank.

```jsx
{isActive && (
  <motion.span
    layoutId={tabIndicatorLayoutId}
    className="absolute inset-x-0 bottom-0 z-10 h-0.5 bg-primary"
    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
  />
)}
```

The label is wrapped in `<span className="relative z-10">` so it always stays
above the cover span and indicator.

### f. Right-aligned action slot (the Columns / Column Visibility button)

The strip is a `justify-between` flex row: the tab buttons sit on the left, and
an optional actions cluster sits on the right. The cluster only renders when
there's a custom `actions` node or a column picker to show.

```jsx
{hasActions && (
  <div className="flex shrink-0 items-center gap-2 self-center">
    {actions}
    {columnPicker}
  </div>
)}
```

- `shrink-0` keeps the buttons from being squeezed when the tab row is wide.
- `items-center gap-2` lays the actions out in a tidy horizontal row.
- `self-center` vertically centers the cluster against the taller tab strip
  (the tabs use `items-end`, so without this the actions would also drop to the
  bottom edge).

The built-in action is the **column-visibility button** (`ColumnVisibilityPicker`),
a shadcn `DropdownMenu` whose trigger is a shadcn `Button`:

```jsx
<DropdownMenuTrigger asChild>
  <Button variant="outline" size="sm" className="shrink-0">
    <Columns3 className="size-4 mr-1" />
    Columns
    {hiddenCount > 0 && (
      <span className="ml-1.5 rounded bg-primary/15 px-1.5 text-xs text-primary tabular-nums">
        {hiddenCount}
      </span>
    )}
  </Button>
</DropdownMenuTrigger>
```

Key styling points:

- **Use the shadcn `Button` with `variant="outline" size="sm"`** — this is the
  canonical look for tab-strip actions. The outline variant reads as a quiet,
  bordered control that doesn't compete with the active tab; `size="sm"` keeps it
  proportional to the strip. Match this for any sibling action you add so the
  cluster stays visually consistent.
- The leading **icon** is `lucide-react`'s `Columns3` at `size-4 mr-1` (16px,
  small right gap before the label).
- The **count badge** (number of hidden columns) is a primary-tinted pill:
  `rounded bg-primary/15 px-1.5 text-xs text-primary tabular-nums`. It reuses
  `--primary` at 15% alpha for the fill and full `--primary` for the digits, so
  it ties back to the same accent as the sliding indicator. `tabular-nums` keeps
  the badge width stable as the count changes.

Any custom node you pass into the `actions` slot renders *before* the column
picker in the same cluster. To stay consistent, build those with the same
shadcn `Button variant="outline" size="sm"` recipe.

## 2. The four tricks agents usually miss

1. **The three-part folder-tab merge.** `-mb-px` on the button, `border-b` on
   the strip, and the `-bottom-px h-px bg-card` cover span are one mechanism, not
   three. The button is pulled 1px down onto the strip's bottom border, then the
   card-colored span repaints that 1px so the active tab fuses with the grid.
   Drop any one of the three and you get a visible seam or a doubled line.
2. **Stacking context.** The button is `relative`; the label and the indicator
   are `z-10`. Without `relative` on the button the absolutely-positioned
   children escape it; without `z-10` on the label/indicator they can be painted
   under the cover span.
3. **Active background must equal the grid.** The active tab uses `bg-card`,
   the *same* token as the container's `bg-card`. If the active fill is any other
   color, the "joined to the grid" illusion breaks — they must be identical.
4. **Unique `layoutId` per mounted table.** The sliding indicator is shared by
   `layoutId`. If two tabbed tables are on screen with the same id, framer-motion
   treats them as one and the accent jumps between tables. Give each mounted
   table a unique `layoutId` (the component exposes a `tabIndicatorLayoutId`
   prop, defaulting to `'ts-tabbed-table-indicator'`, precisely so a second
   instance can override it).

## 3. Token → color table (exact oklch from `src/styles.css`)

| Token | Role in the tab bar | Light (`:root`) | Dark (`.dark`) |
| --- | --- | --- | --- |
| `--card` | Active tab background **and** the 1px cover span (must equal the grid) | `oklch(1 0 0)` | `oklch(0.30 0.022 260)` |
| `--primary` | Sliding accent indicator | `oklch(0.55 0.18 260)` | `oklch(0.6 0.18 260)` |
| `--muted` | Strip background at `/40`; inactive hover at `/70` | `oklch(0.955 0.01 260)` | `oklch(0.40 0.022 260)` |
| `--muted-foreground` | Inactive tab text | `oklch(0.54 0.02 260)` | `oklch(0.62 0.018 260)` |
| `--border` | Active tab border + strip bottom border | `oklch(0.82 0.03 260)` | `oklch(0.4 0.035 260)` |
| `--foreground` | Active tab text + inactive hover text | `oklch(0.32 0.03 260)` | `oklch(0.94 0.012 260)` |

### Alpha usage on `--muted`

The strip and the inactive hover both reuse `--muted` at reduced opacity rather
than separate tokens:

- `bg-muted/40` — the strip background, a faint (40% alpha) wash of `--muted`
  over the card. Light enough that the inactive tabs (transparent) read as part
  of the strip while the active tab (solid `bg-card`) pops forward.
- `hover:bg-muted/70` — the inactive-tab hover, a stronger (70% alpha) wash that
  gives feedback without reaching the full-strength active fill.

Keeping both as alpha variants of one token means a theme change to `--muted`
keeps the strip and hover in proportion automatically.

## 4. shadcn components the table relies on

The tab strip itself uses **no** shadcn component — it's plain `<button>` +
`motion.span` elements (see §1). But the full `TSTabbedTable` render tree
(`TSTabbedTable` → `TSReadOnlyTable` / `TSEditableTable` → `TableCore` → the
cell / filter / skeleton / picker sub-components) pulls in nine shadcn
components. They all live under `@/components/ui/*` and follow the same
convention: a base class string built into the component, merged via `cn()` with
whatever `className` the call site passes (call-site classes win on conflict).

Quick map of where each is used:

| shadcn component | Used by |
| --- | --- |
| `Button` (`@/components/ui/button`) | `ColumnVisibilityPicker` (Columns button), `FilterPopover` |
| `ButtonGroup` (`@/components/ui/button-group`) | `FilterPopover` |
| `Checkbox` (`@/components/ui/checkbox`) | `TableCore` (row-select), `BodyCell`, `CellEditors`, `FilterPopover` |
| `DropdownMenu` (`@/components/ui/dropdown-menu`) | `ColumnVisibilityPicker` |
| `Input` (`@/components/ui/input`) | `CellEditors`, `FilterPopover` |
| `Popover` (`@/components/ui/popover`) | `FilterPopover` |
| `Select` (`@/components/ui/select`) | `CellEditors` |
| `Skeleton` (`@/components/ui/skeleton`) | `TableSkeleton` (loading state) |
| `Textarea` (`@/components/ui/textarea`) | `CellEditors` |

> `@/components/ui/animation-presets` is also imported by `TableCore`, but it's a
> local fade/animation constants helper, **not** a shadcn component, so it's not
> listed here.

Below, each component's **default** base class string (as defined in
`src/components/ui/*`) is given verbatim, followed by the **customizations** our
table call sites layer on via `className`.

### Button

Default (from `buttonVariants` in `button.tsx`):

- Base: `group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none active:scale-[0.97] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`
- `variant="outline"` (the one the table uses): `border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50`
- `size="sm"` (the one the table uses): `h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5`

Customizations:

- `ColumnVisibilityPicker` Columns button: `className="shrink-0"` (redundant with the base `shrink-0`, kept for intent) — `variant="outline" size="sm"`. Note the `aria-expanded:bg-muted` in the outline variant means the button stays in its "muted" state while the dropdown is open.
- `FilterPopover` Select-all / Deselect-all buttons: `className="h-7 px-2.5 text-xs"` — `variant="outline" size="sm"`. The explicit `h-7` matches the `sm` height; `text-xs` shrinks the label below the `sm` default of `text-[0.8rem]`.

### ButtonGroup

Default (from `buttonGroupVariants` in `button-group.tsx`):

- Base: `flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-lg [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1`
- `orientation="horizontal"` (default): `[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-lg!` — i.e. it strips the inner border radii / doubled borders so the two filter buttons read as one joined control.

Customizations:

- `FilterPopover`: `className="mb-2"` (just bottom spacing; the joining behavior is all default).

### Checkbox

Default (`checkbox.tsx`):

- Root: `border-input dark:bg-input/30 data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary data-checked:border-primary aria-invalid:aria-checked:border-primary aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 flex size-4 items-center justify-center rounded-[4px] border transition-colors group-has-disabled/field:opacity-50 focus-visible:ring-3 aria-invalid:ring-3 peer relative shrink-0 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50` — note the checked state uses `--primary` for the fill, tying it to the same accent as the tab indicator. The `after:-inset-*` enlarges the hit target beyond the 16px box.
- Indicator: `[&>svg]:size-3.5 grid place-content-center text-current transition-none`

Customizations:

- `TableCore` row-select header/cell checkboxes: no `className` — pure default. They support an `'indeterminate'` checked state for partial selection.
- `BodyCell` read-only boolean cell: `className="pointer-events-none"` plus `disabled` (display-only checkbox).
- `CellEditors` / `BodyCell` editable boolean: no style override; wrapped in a `<label className="flex items-center gap-2 ...">`.
- `FilterPopover` value checkboxes: no `className` override.

### DropdownMenu

Default `DropdownMenuContent` (`dropdown-menu.tsx`):

- `z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 ... data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95` (entrance/exit animation + popover surface)
- `DropdownMenuLabel`: `px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7`
- `DropdownMenuSeparator`: `-mx-1 my-1 h-px bg-border`
- `DropdownMenuCheckboxItem`: `relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground ...` (with a right-aligned check indicator)

Customizations (`ColumnVisibilityPicker`):

- `DropdownMenuContent`: `align="end" className="w-56"` — pins the menu to the right edge of the trigger (so it doesn't overflow the strip) and fixes the width at `14rem` instead of matching the trigger width.
- A plain `<div className="max-h-72 overflow-y-auto">` wraps the column checkbox items so a long column list scrolls (`18rem` max height).

### Input

Default (`input.tsx`):

- `h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none ... placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:... aria-invalid:... md:text-sm dark:bg-input/30 ...`

Customizations:

- `CellEditors` text editor: `className="h-8 min-w-0 w-full my-1.5"` — adds vertical breathing room (`my-1.5`) so the editor doesn't touch the cell edges.
- `FilterPopover` search box: `className="h-8 text-xs pr-7"` — shrinks the text to `text-xs` and reserves right padding (`pr-7`) for the clear (X) button overlaid on top.

### Popover

Default `PopoverContent` (`popover.tsx`):

- `bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 ... ring-foreground/10 flex flex-col gap-2.5 rounded-lg p-2.5 text-sm shadow-md ring-1 duration-100 z-50 w-72 origin-(--radix-popover-content-transform-origin) outline-hidden`

Customizations (`FilterPopover`):

- `className="w-60 p-3 origin-top-left"` — narrows to `15rem`, bumps padding to `p-3`, and forces the scale-in animation to originate from the top-left corner (since the popover hangs off a small filter icon).

### Select

Default `SelectTrigger` (`select.tsx`):

- `border-input data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 ... gap-1.5 rounded-lg border bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors select-none focus-visible:ring-3 ... data-[size=default]:h-8 data-[size=sm]:h-7 ... flex w-fit items-center justify-between whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:opacity-50 ...` (chevron rotates 180° on open)
- `SelectContent` is a `bg-popover` surface with the same `data-open`/`data-closed` zoom+slide animation set as the dropdown/popover.

Customizations (`CellEditors`):

- `SelectTrigger`: `className="h-8 min-w-0 w-full my-1.5"` — makes the trigger fill the cell width and adds the same `my-1.5` vertical inset as the other editors.

### Skeleton

Default (`skeleton.tsx`):

- `animate-pulse rounded-md bg-muted` — a pulsing muted block.

Customizations (`TableSkeleton`):

- Header cells: `className="h-4 w-3/4"`.
- Body cells: `className="h-3.5"` (width varies per column to mimic real content).

### Textarea

Default (`textarea.tsx`):

- `border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 ... rounded-lg border bg-transparent px-2.5 py-2 text-base transition-colors focus-visible:ring-3 ... md:text-sm placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full outline-none disabled:...`

Customizations (`CellEditors`):

- `className="min-h-11 py-2 min-w-0 w-full my-1.5 resize-none"` — shrinks the min height from `min-h-16` to `min-h-11` to fit inside a cell, disables manual resizing, and adds the shared `my-1.5` inset.
