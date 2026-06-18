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
- **Test:** `npm test` (Vitest, jsdom) — includes the jsdom virtualizer perf guard
- **Perf benchmark (real browser):** `npm run test:perf` (Vitest browser mode + Playwright/Chromium; NOT part of `npm test`)
- **Typecheck:** `npm run typecheck` (tsc --noEmit)

## Publishing
The same package (`tablegx`) is published under two scopes to two registries:
- `@twentygx/tablegx` → public npm (`https://registry.npmjs.org/`)
- `@tutera/tablegx` → private `@tutera` registry

Commands (see `scripts/publish.mjs`):
- `npm run publish:npm` — publish `@twentygx/tablegx` to npm
- `npm run publish:tutera` — publish `@tutera/tablegx` to the private registry
- `npm run publish:all` — both (npm first; extra flags like `--dry-run` / `--otp=CODE` pass through)

The script builds once, swaps only the `package.json` `name` scope per target, and always restores the canonical `@twentygx` name afterward. Per-scope registry routing and auth (`NPM_TOKEN`, `TUTERA_AUTH`) live in `.npmrc` via env interpolation — never commit raw tokens. Bump the version before publishing; registries reject republishing an existing version.

## Notes
- Because this is a library, no workflow/web server is configured and deployment is not applicable. Consumers install it as a dependency.

## Maintaining agent skills
This package ships four `@tanstack/intent` agent skills in `skills/`, each declaring `sources` (e.g. `README.md`, `src/index.ts`, `src/types.ts`, `src/theme.css`, `src/lib/columns.tsx`, `src/components/TabbedTable.tsx`, `src/components/IndependentTabbedTable.tsx`). Skills must be kept in sync **within the same task that changes a tracked source**, so they never merge stale.

Before completing any task:
1. Run the skills validation step (`skills`), or `npm run check:skills:strict`.
2. If a source you changed is flagged, update the affected `skills/<name>/SKILL.md` so it matches the new behavior.
3. Re-baseline with `npm run check:skills -- --write` and commit the updated `skills/` files (including `skills/sync-state.json`) as part of the same task.

The post-merge script (`scripts/post-merge.sh`) still runs the non-strict `npm run check:skills` as a silent backstop, but pre-merge updates by the task agent are the primary mechanism.

## User preferences
(none recorded yet)
