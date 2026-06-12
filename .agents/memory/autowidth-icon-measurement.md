---
name: Auto-width header icon measurement
description: Why measuring per-element offsetWidth for the header floor is fragile under the jsdom test harness, and the cap that guards it.
---

The auto-column-width header floor can optionally measure the real rendered
width of the sort/filter affordances (instead of fixed allowances) by reading
their layout box. This is safe in a real browser but fragile in jsdom tests.

**The trap:** the jsdom perf guard (`installJsdomViewport`) and the component
tests' `withElementSize` helper both override `offsetWidth` (and client/offset
sizes) on `HTMLElement.prototype` globally, returning a container/viewport-sized
box (e.g. 800 or the perf viewport width ~1920) for *every* element. So any code
that reads a small element's `offsetWidth` expecting its true per-element size
gets the container size instead. For the icon affordances this exploded each
column's header floor to thousands of px, which widened columns so far that a
4000px horizontal scroll no longer shifted the rendered column set — silently
breaking the column-virtualization "sets differ" assertions in the jsdom perf
guard (which IS part of `npm test`, via `*.perf.test.tsx`).

**The rule:** when the header floor consumes a measured icon-affordance width,
clamp it with an upper sanity bound (icons are a couple of small buttons) and
fall back to the fixed allowance for any reading above it (or <= 0).
**Why:** an affordance reading far larger than a real icon is a layout artifact
(zero-layout/SSR, or a test mocking offsetWidth to a container box), never a real
icon. **How to apply:** keep the cap in the hook's `resolveHeaderMetrics` measure
helper; don't switch to `getBoundingClientRect` to "fix" it — that just relocates
the fragility (some tests mock that too, keyed off textContent).

Also note: the jsdom `*.perf.test.tsx` timing-budget assertions (render/scroll
ms) can flake under heavy full-suite parallel load even when correctness passes;
they pass deterministically when the perf file is run in isolation.
