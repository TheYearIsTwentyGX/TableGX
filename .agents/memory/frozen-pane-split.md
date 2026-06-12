---
name: Frozen pane split
description: How the frozen/pinned pane is derived in TableCore and why it must be identity-based.
---

# Frozen pane split must be by column identity, not position

The frozen (pinned) pane in the table engine is derived from a **canonical frozen
id set** = the selection column (when row selection is on) plus the first N data
leaf columns (`frozenColumns`, excluding the selection column), computed from
`getAllLeafColumns()`. The pinned pane is the visible intersection of that set;
the scroll pane is the remaining visible columns.

**Why:** Frozen columns are user-hideable via the "Columns" picker. If the pane
were "the first N *visible* leaf columns" (a positional slice), hiding a frozen
column would silently pull the next scrollable column into the frozen pane. The
identity-based split keeps hidden frozen columns from promoting scroll columns.

**How to apply:** The canonical set is a prefix of the column order, so visible
pinned columns stay contiguous at the front of `visibleLeafColumns` — code that
relies on `cells.slice(0, pinnedCount)` for the pinned region stays valid as long
as `pinnedCount = pinnedColumns.length`. The picker must list frozen columns too;
only the selection column and `enableHiding: false` columns are excluded. In
TabbedTable visibility is per-tab (persisted under `${base}:${tab.id}`) while
selection and sorting are shared, so toggling a frozen column on one tab must not
touch shared state.

## Frozen pane behavior during the tab slide differs by component

The tab-slide shell hands each panel a `pinnedPaneX` = negated slide-x. TableCore
applies it (`x: pinnedPaneX`) to counter-translate the pinned pane so it stays
visually static while the rest slides. **TabbedTable** uses this (shared frozen
columns must look continuous across tab switches). **IndependentTabbedTable** must
NOT — it passes no `pinnedPaneX`, so the pinned pane slides out with the panel.

**Why:** in the independent variant each tab is a separate table with its own
(possibly different) frozen columns, so a static pane would be wrong — there is
nothing shared to hold still. Don't "fix" this to match TabbedTable.
