---
name: rowHeight modes (fixed / per-row / auto)
description: Design constraints for the rowHeight feature — default byte-identity, auto forces column-virt off, and how auto-height virtualized rows measure under jsdom.
---

# rowHeight: number | 'auto' | (row)=>number

## Default must stay byte-identical
When a new prop has an "unset = unchanged" guarantee (rowHeight unset == fixed 56px),
the default render path must be **byte-for-byte** identical, not just visually equal.

**Why:** `cn()` uses tailwind-merge, which preserves class *order* (only later conflicting
classes are dropped). Reordering a class literal (e.g. moving `h-full`) changes the emitted
string even when the resolved styles match — that fails a byte-identity guard.

**How to apply:** keep the exact original class literal and inline-style key order for the
default branch; gate new behavior behind a flag that is falsy by default. For per-row pixel
height, default the resolved value to the old constant so `{height: rowHeightPx}` == `{height: 56}`.

## 'auto' turns column virtualization OFF
Auto rows render every chunk in normal flow (`flex shrink-0`, no absolute `left`) so wrapped
cell content can drive the row height. That requires the full column window, so the engine
forces `effectiveColRange` to all columns when `rowHeight==='auto'`. Row virtualization still
applies. So auto is best for narrower tables; don't assert a *column* window shift in auto perf
benches (columns never shift), only the row window.

## How auto-height virtualized rows measure (and why jsdom guards work)
Virtualized auto rows get `ref={rowVirtualizer.measureElement}` + `data-index`. TanStack
virtual's default measureElement reads **`element.offsetHeight`** (not getBoundingClientRect).
The jsdom perf harness (`installJsdomViewport`) mocks `offsetHeight` on the prototype to the
viewport height, so each auto row measures as the viewport height → only ~1 row fits → the
bounded-window guard holds in jsdom. getBoundingClientRect is NOT mocked (returns 0); if a
future virtual-core version switches measureElement to getBoundingClientRect, the jsdom auto
guard would break (rows measure 0 → window explodes). Real-browser bench measures real heights.
