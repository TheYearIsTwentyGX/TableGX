// Performance regression budgets for the virtualized table engine.
//
// These are WALL-CLOCK budgets, not exact measurements. They are calibrated
// with generous headroom over what the engine actually costs on this dev
// machine so that normal noise never trips them, while a real regression
// (e.g. virtualization breaking, or a per-cell cost being reintroduced) blows
// straight past them. They may need recalibration on slower/faster CI
// hardware — bump the *_BUDGET_MS values, never the *_MAX_* invariants.

/** Canonical benchmark dataset: matches the prior manual benchmark. */
export const PERF_ROWS = 1000
export const PERF_COLS = 50

/** Simulated viewport the benchmark mounts the table into. */
export const VIEWPORT_WIDTH_PX = 1200
export const VIEWPORT_HEIGHT_PX = 600

// ----- Virtualization invariants (hard structural caps, NOT timing) ---------
// The whole point of virtualization: the DOM stays bounded by the viewport
// window no matter how large the dataset is. A 1000x50 grid is 50,000 logical
// cells; only a few dozen rows by a ~2-chunk column window may ever be in the
// DOM. These caps sit well below the full grid but above the real window so
// they only fail if virtualization itself regresses.

/** Max body rows allowed in the DOM at once (real window is ~30). */
export const MAX_RENDERED_ROWS = 64
/** Max body cells allowed in the DOM at once (real window is ~500). */
export const MAX_RENDERED_CELLS = 4000

// ----- jsdom timing budgets (run under default `npm test`) ------------------

/** Median time to mount the 1000x50 table once. */
export const RENDER_BUDGET_MS = 2000
/** Median time for one vertical/horizontal scroll window update. */
export const SCROLL_UPDATE_BUDGET_MS = 800

// ----- Real-browser timing budget (run only via `npm run test:perf`) --------

/**
 * Median per-step time while programmatically scrolling in a real browser,
 * including the rAF the engine needs to commit + paint the new window. This is
 * wall-clock and HARDWARE-SENSITIVE: it includes paint, which on a GPU-less,
 * software-rendered (swiftshader) headless Chromium — as used here and on most
 * CI — costs ~100ms/step for this large scroll area (measured median ~108ms on
 * the dev container, comparable to a GitHub Actions ubuntu-latest runner). The
 * budget keeps generous headroom (~3x) over that baseline so the noisier,
 * shared CI runners never trip it, while a real regression (virtualization
 * breaking → thousands of cells per frame) costs seconds/step and blows well
 * past it. On GPU-backed hardware the real number is far lower; recalibrate
 * down there.
 */
export const BROWSER_SCROLL_STEP_BUDGET_MS = 350
