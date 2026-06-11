---
name: Dark mode class placement
description: Where the `.dark` class must live for the library's theme tokens and Radix overlays to switch
---

# Dark mode toggling

The library has no `dark:` Tailwind utilities. All theming is driven by CSS variables redefined under `:where(.dark)` in `theme.css`, and the `@custom-variant dark (&:is(.dark *))` declaration.

**Rule:** toggle the `dark` class on `document.documentElement` (`<html>`), never on a nested wrapper `<div>`.

**Why:** the `<body>` background and every Radix overlay (dropdowns, popovers, filter menus, dialogs) portal to `document.body`, which sits *outside* any nested wrapper. A nested `.dark` leaves those surfaces on the light root tokens, so the page looks half-dark / broken.

**How to apply:** any app/playground consuming this library should set the class at the root, e.g. `document.documentElement.classList.toggle('dark', isDark)` in an effect.
