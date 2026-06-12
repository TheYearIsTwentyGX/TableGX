---
name: Auto-width font measurement
description: Why auto-column-width text measurement must read the consumer's rendered font, not a hardcoded stack.
---

The library intentionally sets **no** `font-family` of its own — header/body text
inherits whatever font the consumer's app renders with. So auto-column sizing must
measure text in that inherited font, otherwise columns under-size and the header's
`truncate` span clips the final glyph.

**Rule:** derive the measurement font from `getComputedStyle` of a rendered cell
(`[data-tgx-header]` / `[data-tgx-cell]`) at measure time; keep the hardcoded
`HEADER_FONT`/`CELL_FONT` stacks only as the SSR/pre-render fallback. Always add a
small safety margin (`AUTO_WIDTH_SAFETY_MARGIN_PX`) to measured text so sub-pixel
rounding/zoom/letter-spacing can't clip, and recompute widths on
`document.fonts.ready` so late-loading web fonts don't leave stale narrow columns.

**Why:** a hardcoded font stack mismatched the consumer's wider font by a few px per
column, clipping header labels like "Mar"/"Bench".

**How to apply:** the explicit `meta.fixedMeasureWidth` path is consumer-sized — do
NOT add the safety margin there.
