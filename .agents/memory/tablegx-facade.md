---
name: TableGX facade composition
description: Why TableGX delegates per variant instead of re-inlining primitive composition, and the editable-toggle invariant.
---

# TableGX preset facade

`TableGX` is a thin discriminated-`variant` facade. How each branch is built:

- `variant="tabbed"` → renders `<TabbedTable>`; `variant="independent"` → renders `<IndependentTabbedTable>`. These existing components are *themselves* the canonical thin compositions over the shared headless store + compound primitives.
- `variant="table"` → renders `<TableCore editable={...}>` directly (same as `ReadOnlyTable`/`EditableTable`), NOT wrapped in `Table.Provider`/`Container`/`Body`.

**Why:** Inlining the tabbed/independent primitive composition into `TableGX` would duplicate the substantial per-tab adapter logic (sort-only column caching, filter-badge builders, tab models) that already lives in those components — directly violating "one store, no duplicated logic". Delegating reuses the single canonical composition. For a single table there is no cross-tab state to route through the store, and the consumer's public API already exposes controlled filters/selection directly on `TableCore`; wrapping it in a single-tab store + `Container` would only add ceremony and risk double-frame / controlled-prop regressions.

**How to apply:** If asked to make `TableGX` "use the primitives directly" for tabbed/independent, push back — the delegation IS the primitive composition. Static primitive members (`TableGX.Provider`, `.TabStrip`, …) are attached for consumers who need custom chrome layout.

## Editable-toggle invariant
`TableCore` must cancel any in-progress edit when `editable` flips to false (effect: `if (!editable) setEditing(null)`), or the live read-only⇄editable toggle strands an open editor over a now read-only cell. The toggle must not remount (keep `<TableCore>` at a stable position) so scroll/selection survive.
