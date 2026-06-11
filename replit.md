# @twentygx/tablegx

## Overview
A high-performance, type-safe React data-table library: ReadOnlyTable, EditableTable, and TabbedTable built over one virtualized engine (TanStack Table + TanStack Virtual). This is a publishable npm **library**, not a standalone web application — there is no server or frontend to run on a port.

## Project Structure
- `src/` — library source
  - `components/` — public table components (ReadOnlyTable, EditableTable, TabbedTable)
  - `core/` — internal table engine pieces (cells, headers, filters, etc.)
  - `hooks/` — reusable React hooks
  - `lib/` — utilities (aggregates, filtering, columns, dates, measurement)
  - `ui/` — UI primitives (Radix-based)
  - `index.ts` — package entry point
  - `theme.css` — exported styles
- `test/` — Vitest + Testing Library test suite
- `dist/` — build output (generated)

## Tooling
- **Runtime:** Node.js 22 (required by tsdown/rolldown build toolchain)
- **Package manager:** npm
- **Build:** `npm run build` (tsdown → ESM bundle + d.ts + theme.css)
- **Dev (watch):** `npm run dev`
- **Test:** `npm test` (Vitest, jsdom)
- **Typecheck:** `npm run typecheck` (tsc --noEmit)

## Notes
- Because this is a library, no workflow/web server is configured and deployment is not applicable. Consumers install it as a dependency.

## User preferences
(none recorded yet)
