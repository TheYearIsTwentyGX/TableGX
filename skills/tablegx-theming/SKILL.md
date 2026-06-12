---
name: tablegx-theming
description: >-
  Style @twentygx/tablegx with theme.css CSS variables (--tgx-header-bg, --primary),
  TableClassNames slot overrides, getCellClassName, data-tgx-* attribute selectors,
  translucent pinned/header backdrop-filter. Use when theming tables, dark mode,
  Material/Fluent-style skins, or per-cell conditional classes.
type: core
library: tablegx
library_version: "2.1.0"
sources:
  - "README.md"
  - "src/theme.css"
---

# @twentygx/tablegx — Theming

## Setup

Import default tokens (zero-specificity `:where()` — your `:root` / `.dark` overrides win):

```css
@import '@twentygx/tablegx/theme.css';

:root {
  --primary: oklch(0.55 0.2 260);
  --background: oklch(0.99 0 0);
  --tgx-header-bg: var(--card);
  --tgx-row-hover-bg: oklch(0.96 0.01 260);
  --tgx-row-selected-bg: oklch(0.93 0.03 260);
}

.dark {
  --background: oklch(0.15 0 0);
  --tgx-header-bg: oklch(0.2 0 0);
}
```

Legacy export: `@twentygx/tablegx/style.css` aliases `theme.css`.

## Core Patterns

### classNames slots

Available on `ReadOnlyTable`, `EditableTable`, and `TabbedTable` (extra tab slots):

```tsx
<ReadOnlyTable
  classNames={{
    root: 'rounded-lg border',
    toolbar: 'px-2',
    headerCell: 'font-semibold',
    bodyRow: 'transition-colors',
    bodyCell: 'tabular-nums',
    footerCell: 'font-medium',
  }}
  ...
/>
```

TabbedTable adds: `container`, `tabStrip`, `tab`, `activeTab`, `inactiveTab`, `tabIndicator`, `panel`.

Caller classes merge with defaults via `tailwind-merge` (caller wins).

### Per-cell conditional styling

```tsx
<EditableTable
  getCellClassName={(row, columnId) =>
    pending.has(`${row.id}:${columnId}`) ? 'bg-amber-500/10' : undefined
  }
  ...
/>
```

### Data-attribute hooks (plain CSS)

| Selector | Region |
| -------- | ------ |
| `[data-tgx-table]` | Table root |
| `[data-tgx-tabbed-table]` | TabbedTable root |
| `[data-tgx-toolbar]` | Toolbar |
| `[data-tgx-header-block]` | Sticky header |
| `[data-tgx-footer-row]` | Footer |
| `[data-tgx-pinned]` | Frozen pane (header, body, footer) |
| `[data-tgx-tab-strip]` | Tab bar |
| `[data-tgx-row]` / `[data-tgx-cell]` / `[data-tgx-header]` | Row/cell/header |
| `[data-tgx-pop]` | Popovers/menus |
| `[data-tgx-dialog]` | Confirm dialogs |

### Translucent / glass themes

```css
[data-tgx-header-block],
[data-tgx-pinned] {
  background: color-mix(in oklch, var(--card) 70%, transparent);
  backdrop-filter: blur(12px);
}
```

## Common Mistakes

### HIGH Translucent header without backdrop-filter

Wrong:

```css
[data-tgx-header-block] {
  background: rgba(255, 255, 255, 0.4);
}
```

Correct:

```css
[data-tgx-header-block] {
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(8px);
}
```

Scrolling rows otherwise bleed through sticky header and pinned columns.

Source: README.md

### MEDIUM Forking theme.css in node_modules

Wrong: copy/edit `node_modules/@twentygx/tablegx/dist/theme.css`.

Correct: import the package file and override variables in your app stylesheet.

Source: README.md

### MEDIUM Assuming SSR column widths are final

Wrong: snapshot-testing server HTML expecting measured auto-widths.

Correct: SSR renders fallback min widths; client re-measures in a pre-paint layout effect without visible shift. Pass `measure` prop to stub in tests.

Source: README.md

See also: tablegx-quickstart/SKILL.md — Tailwind @source + theme.css import order
