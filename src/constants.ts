/** Fixed body row height (enables row virtualization). */
export const ROW_HEIGHT_PX = 56

/** Header row height. */
export const HEADER_HEIGHT_PX = 48

/** Pre-measurement fallback width, used only until auto-sizing resolves. */
export const MIN_COLUMN_WIDTH_PX = 160

/** Hard floor so an empty-header column still shows its icons. */
export const ABSOLUTE_MIN_COLUMN_WIDTH_PX = 48

/**
 * Slack added to each auto-sized column's measured text width so sub-pixel
 * differences (rounding, browser zoom, letter-spacing, font metric mismatches)
 * cannot clip the final glyph of a header label or cell value.
 */
export const AUTO_WIDTH_SAFETY_MARGIN_PX = 4

/**
 * Auto-sized frozen (pinned) columns are scaled so their combined width does not
 * exceed this fraction of the viewport until the user resizes a pinned data column;
 * after that, pinned columns use their effective widths and the pane may grow wider.
 */
export const FROZEN_PANE_MAX_FRACTION = 0.5

/** Horizontal indent applied per nesting depth for the disclosure column. */
export const INDENT_STEP_PX = 20

/** System-wide max width for auto-sized columns (per-column override via meta.maxColumnWidth). */
export const MAX_COLUMN_WIDTH_PX = 480

/** Horizontal header padding (px-3 each side) used by overlay-fit math. */
export const HEADER_H_PADDING_PX = 24

/** Flex gap between header text and its icon cluster (gap-1). */
export const HEADER_ICON_GAP_PX = 4

/** Id of the injected row-selection checkbox column. */
export const SELECTION_COLUMN_ID = '__tgx_select__'

/** Width of the injected row-selection checkbox column. */
export const SELECTION_COLUMN_WIDTH_PX = 48
