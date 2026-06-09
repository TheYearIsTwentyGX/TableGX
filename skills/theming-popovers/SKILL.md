---
name: theming-popovers
description: >
  Apply glassmorphism themes without breaking CSS stacking. Load this skill when passing Tailwind classes to `TableGX` themes, particularly when dealing with transparency and blurs.
type: core
library: tablegx
library_version: "1.0.0"
sources:
  - "src/components/table/themes.ts"
---

# TableGX — Theming Popovers

## Setup

Themes in `TableGX` are defined by passing a `classNames` object. When applying glassmorphism (blurs) to the container, it's critical to decouple the backdrop filter from the parent container.

```tsx
import { TabbedTable } from 'tablegx';

const LIQUID_GLASS_THEME = {
  // Use a pseudo-element for the container blur, NOT the container directly
  container: 'relative isolate before:absolute before:inset-0 before:backdrop-blur-xl before:-z-10',
  popoverContent: 'backdrop-blur-md bg-white/10 border-white/20'
};

export function Table() {
  return <TabbedTable classNames={LIQUID_GLASS_THEME} /* ...props */ />;
}
```

## Core Patterns

### Popover Transparency
Popovers should apply their own blurs, since they are rendered via React portals (or absolute positioning) and need their own visual hierarchy.

```tsx
const customTheme = {
  popoverContent: 'backdrop-blur-md bg-black/40 border border-white/10'
};
```

## Common Mistakes

### HIGH Nested backdrop filters

Wrong:

```tsx
const theme = {
  container: 'backdrop-blur-xl bg-white/10',
  popoverContent: 'backdrop-blur-md bg-white/10'
};
```

Correct:

```tsx
const theme = {
  container: 'relative isolate before:absolute before:inset-0 before:backdrop-blur-xl before:-z-10 bg-white/10',
  popoverContent: 'backdrop-blur-md bg-white/10'
};
```

Applying `backdrop-blur` directly to the `container` breaks `backdrop-blur` on child popovers due to browser composition bugs. Always decouple the backdrop filter onto a pseudo-element.

Source: maintainer interview
