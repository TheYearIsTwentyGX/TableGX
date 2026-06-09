# TableGX Skill Specification

This library uses a focused set of Agent Skills to ensure AI coding agents don't make common mistakes when scaffolding `TableGX` views.

## Known Failure Modes
1. **Generic Table Hallucination**: Assuming `tablegx` requires writing native `<table>` tags instead of passing configuration to the `<TabbedTable />` wrapper.
2. **Missing `fixedMeasureWidth`**: Adding action buttons to cells without providing a hard width boundary, which breaks the pre-measurement auto-sizing engine.
3. **Nested Backdrop Filters**: Applying `backdrop-blur-*` utility classes to the container wrapper when the table mounts dropdowns or popovers within the same hierarchy, causing Safari and Chrome to render the child popovers opaquely.

These failure modes dictate the necessity of three primary skills:
- `init-tabbed-table`
- `config-action-columns`
- `theming-popovers`
