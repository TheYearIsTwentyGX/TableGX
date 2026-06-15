---
name: Perf harness scroll-container selection
description: Why a new horizontally-scrollable strip must not reuse the .tgx-scrollbar class
---

The jsdom + browser perf guards locate the virtualized body scroll container via
`getScrollContainer`, which does `root.querySelector('.tgx-scrollbar')` — i.e. the
FIRST element in the DOM carrying that class.

**Rule:** Any new scrollable container that sits *above* the table body in the DOM
(e.g. the TabbedTable tab strip) must NOT use the `.tgx-scrollbar` class, or the
perf tests will grab it instead of the body scroller and the virtualization
assertions (rows/cols change on scroll) silently break.

**How to apply:** Give such strips their own class (the tab strip uses
`.tgx-tab-scroll`) that carries the themed scrollbar colors + hides the bar,
rather than reusing `.tgx-scrollbar`.
