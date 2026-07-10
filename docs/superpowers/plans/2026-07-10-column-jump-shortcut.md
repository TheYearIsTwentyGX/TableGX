# Column jump shortcut (Ctrl+G / Cmd+G) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in Ctrl+G / Cmd+G shortcut that opens a searchable "jump to column" dialog on every TableGX surface (`ReadOnlyTable`, `EditableTable`, `TableGX`, `TabbedTable`, `IndependentTabbedTable`); selecting a column switches to its tab (if needed) and scrolls it into view.

**Architecture:** The shortcut listener, dialog, and own-column scroll logic all live in `TableCore` (the one thing every surface renders), gated by a new `enableColumnJump` prop. The tab store (`src/primitives/store.tsx`) only bridges "this column belongs to a different tab" — it hands the active tab's `TableCore` every other tab's entries plus a callback, and relays a pending scroll-column id to whichever `TableCore` mounts next after a tab switch.

**Tech Stack:** React 19, TypeScript, `@tanstack/react-table`, Radix UI primitives (new: `@radix-ui/react-dialog`), Tailwind (via `cn()`), Vitest + `@testing-library/react` + `@testing-library/user-event`.

## Global Constraints

- Ctrl+G (Windows/Linux) or Cmd+G (Mac) is the fixed binding — not configurable.
- `enableColumnJump` defaults to `false`; `columnJumpIncludeHidden` defaults to `true`.
- The shortcut only fires when focus is already inside the specific table instance (plain React `onKeyDown` on the table's root wrapper — no `document`-level listener).
- No fuzzy matching — plain case-insensitive substring match on the column label.
- No new public exports beyond the two new props + one new `classNames` key described below; `ColumnJumpEntry` and `ColumnJumpDialog` stay internal (not exported from `src/index.ts`).
- Full design context: `docs/superpowers/specs/2026-07-10-column-jump-shortcut-design.md`.

---

## Task 1: `ColumnJumpDialog` UI component

**Files:**
- Modify: `package.json` (add `@radix-ui/react-dialog` dependency)
- Create: `src/ui/dialog.tsx`
- Create: `src/core/ColumnJumpDialog.tsx`
- Modify: `src/types.ts` (add the `ColumnJumpEntry` type only — the two new boolean props and the `classNames` key are added in Task 2, where they're first consumed)
- Test: Create `test/columnJumpDialog.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks (first task).
- Produces:
  - `ColumnJumpEntry` (`src/types.ts`): `{ columnId: string; label: string; hidden: boolean; tabId?: string; tabLabel?: ReactNode }`.
  - `ColumnJumpDialog` (`src/core/ColumnJumpDialog.tsx`), props `{ open: boolean; onOpenChange: (open: boolean) => void; entries: ColumnJumpEntry[]; onSelect: (entry: ColumnJumpEntry) => void; className?: string }`. Task 2 renders this inside `TableCore`.
  - `Dialog`, `DialogContent`, `DialogTrigger`, `DialogTitle`, `DialogDescription` (`src/ui/dialog.tsx`) — internal UI primitives, not exported from `src/index.ts`.

- [ ] **Step 1: Add the `@radix-ui/react-dialog` dependency**

```bash
npm install @radix-ui/react-dialog@^1.1.19
```

- [ ] **Step 2: Add the `ColumnJumpEntry` type**

In `src/types.ts`, add this near `AdvancedFeatureProps` (after its closing `}` at what is currently line 321):

```ts
/**
 * Internal — one row of the Ctrl+G "jump to column" dialog (see
 * `AdvancedFeatureProps.enableColumnJump`). Not exported publicly; `tabId` /
 * `tabLabel` are set only for entries belonging to a different tab than the
 * one currently rendering the dialog.
 */
export type ColumnJumpEntry = {
  columnId: string
  label: string
  hidden: boolean
  tabId?: string
  tabLabel?: ReactNode
}
```

- [ ] **Step 3: Add the `Dialog` UI primitive**

Create `src/ui/dialog.tsx`, mirroring the existing `src/ui/alert-dialog.tsx` pattern exactly but over `@radix-ui/react-dialog`:

```tsx
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as React from 'react'
import { cn } from '../lib/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      data-tgx-fade=""
      className="fixed inset-0 z-50 bg-black/50"
    />
    <DialogPrimitive.Content
      ref={ref}
      data-slot="dialog-content"
      data-tgx-dialog=""
      className={cn(
        'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-lg sm:max-w-sm',
        className,
      )}
      {...props}
    />
  </DialogPrimitive.Portal>
))
DialogContent.displayName = 'DialogContent'

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="dialog-title"
    className={cn('text-sm font-semibold', className)}
    {...props}
  />
))
DialogTitle.displayName = 'DialogTitle'

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="dialog-description"
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = 'DialogDescription'
```

- [ ] **Step 4: Write the failing tests for `ColumnJumpDialog`**

Create `test/columnJumpDialog.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ColumnJumpDialog } from '../src/core/ColumnJumpDialog'
import type { ColumnJumpEntry } from '../src/types'

const entries: ColumnJumpEntry[] = [
  { columnId: 'name', label: 'Name', hidden: false },
  { columnId: 'city', label: 'City', hidden: true },
  { columnId: 'country', label: 'Country', hidden: false },
]

const foreignEntries: ColumnJumpEntry[] = [
  { columnId: 'name', label: 'Name', hidden: false },
  { columnId: 'total', label: 'Total', hidden: false, tabId: 'b', tabLabel: 'Tab B' },
]

function Harness({
  initialEntries,
  onSelect = () => {},
}: {
  initialEntries: ColumnJumpEntry[]
  onSelect?: (entry: ColumnJumpEntry) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <ColumnJumpDialog
      open={open}
      onOpenChange={setOpen}
      entries={initialEntries}
      onSelect={onSelect}
    />
  )
}

describe('ColumnJumpDialog', () => {
  it('lists every entry alphabetically when the query is empty', async () => {
    render(<Harness initialEntries={entries} />)
    const dialog = await screen.findByRole('dialog')
    const rows = within(dialog).getAllByRole('button')
    expect(rows.map((r) => r.textContent)).toEqual(['CityHidden', 'Country', 'Name'])
  })

  it('filters case-insensitively as the user types', async () => {
    const user = userEvent.setup()
    render(<Harness initialEntries={entries} />)
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'CO');
    expect(within(dialog).getByRole('button', { name: 'Country' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Name' })).not.toBeInTheDocument()
  })

  it('shows "No columns match" when nothing matches', async () => {
    const user = userEvent.setup()
    render(<Harness initialEntries={entries} />)
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'zzz')
    expect(within(dialog).getByText('No columns match')).toBeInTheDocument()
  })

  it('marks hidden entries', async () => {
    render(<Harness initialEntries={entries} />)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'CityHidden' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Country' })).toBeInTheDocument()
  })

  it('shows a tab badge only when entries span more than one tab', async () => {
    render(<Harness initialEntries={entries} />)
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText('Tab B')).not.toBeInTheDocument()

    render(<Harness initialEntries={foreignEntries} />)
    const dialogs = await screen.findAllByRole('dialog')
    dialog = dialogs[dialogs.length - 1]!
    expect(within(dialog).getByText('Tab B')).toBeInTheDocument()
  })

  it('Enter selects the highlighted entry and closes', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness initialEntries={entries} onSelect={onSelect} />)
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), '{Enter}')
    expect(onSelect).toHaveBeenCalledWith(entries[1]) // alphabetical: City is first
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ArrowDown moves the highlight before Enter selects', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness initialEntries={entries} onSelect={onSelect} />)
    const dialog = await screen.findByRole('dialog')
    const box = within(dialog).getByRole('textbox')
    await user.type(box, '{ArrowDown}{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(entries[0]) // City, Country, Name -> index 2 -> Name
  })

  it('clicking a row selects it directly', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness initialEntries={entries} onSelect={onSelect} />)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Country' }))
    expect(onSelect).toHaveBeenCalledWith(entries[2])
  })

  it('Escape closes without selecting', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness initialEntries={entries} onSelect={onSelect} />)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test -- test/columnJumpDialog.test.tsx`
Expected: FAIL — `Cannot find module '../src/core/ColumnJumpDialog'` (it doesn't exist yet).

- [ ] **Step 6: Implement `ColumnJumpDialog`**

Create `src/core/ColumnJumpDialog.tsx`:

```tsx
import { EyeOffIcon, SearchIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '../lib/cn'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import type { ColumnJumpEntry } from '../types'

export type ColumnJumpDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: ColumnJumpEntry[]
  onSelect: (entry: ColumnJumpEntry) => void
  className?: string
}

function entryKey(entry: ColumnJumpEntry): string {
  return `${entry.tabId ?? ''}:${entry.columnId}`
}

/**
 * Ctrl+G / Cmd+G "jump to column" dialog: type-to-filter list, Up/Down + Enter
 * to select, click to select directly. Rendered by `TableCore` (see
 * `enableColumnJump`); the merged own-tab + foreign-tab entry list and the
 * cross-tab switch are the caller's responsibility.
 */
export function ColumnJumpDialog({
  open,
  onOpenChange,
  entries,
  onSelect,
  className,
}: ColumnJumpDialogProps) {
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setHighlighted(0)
  }, [open])

  const showTabBadge = useMemo(
    () => new Set(entries.map((e) => e.tabId ?? '')).size > 1,
    [entries],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q ? entries.filter((e) => e.label.toLowerCase().includes(q)) : entries
    return [...matches].sort((a, b) => a.label.localeCompare(b.label))
  }, [entries, query])

  useEffect(() => {
    setHighlighted((prev) => Math.min(prev, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  const select = (entry: ColumnJumpEntry) => {
    onSelect(entry)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-sm', className)}>
        <DialogTitle className="sr-only">Jump to column</DialogTitle>
        <DialogDescription className="sr-only">
          Search for a column by name and press Enter to jump to it.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to column…"
            className="h-7 border-none px-0 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlighted((prev) => Math.min(prev + 1, filtered.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlighted((prev) => Math.max(prev - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const entry = filtered[highlighted]
                if (entry) select(entry)
              }
            }}
          />
        </div>
        <div className="tgx-scrollbar max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No columns match
            </p>
          ) : (
            filtered.map((entry, index) => (
              <button
                key={entryKey(entry)}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  index === highlighted
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/60',
                )}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => select(entry)}
              >
                <span className="flex-1 truncate">{entry.label}</span>
                {entry.hidden && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <EyeOffIcon aria-hidden className="size-3.5" />
                    <span className="sr-only">Hidden</span>
                  </span>
                )}
                {showTabBadge && entry.tabId !== undefined && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {entry.tabLabel}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- test/columnJumpDialog.test.tsx`
Expected: PASS (all 9 tests). If `ArrowDown`/`ArrowUp`/`Enter` typed via `user.type` don't register as special keys, switch those two tests to `user.keyboard()` with the same `{ArrowDown}`/`{Enter}` syntax instead of `user.type()` — `user.keyboard()` is the more literal fit and is already used elsewhere in this test suite's Escape case.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck
git add package.json package-lock.json src/ui/dialog.tsx src/core/ColumnJumpDialog.tsx src/types.ts test/columnJumpDialog.test.tsx
git commit -m "feat: add the Ctrl+G column-jump dialog component"
```

---

## Task 2: `TableCore` integration (single-table jump)

**Files:**
- Modify: `src/types.ts:247-321` (`AdvancedFeatureProps`) and `src/types.ts` (`TableClassNames`, currently lines 202-217)
- Modify: `src/core/TableCore.tsx` (props type at `TableCoreProps` lines 116-157; destructure at lines 456-515; new hooks after line 924; root JSX at lines 1378-1388)
- Test: Create `test/columnJump.test.tsx`

**Interfaces:**
- Consumes: `ColumnJumpEntry` and `ColumnJumpDialog` from Task 1.
- Produces:
  - `AdvancedFeatureProps<TRow>.enableColumnJump?: boolean` and `.columnJumpIncludeHidden?: boolean` — inherited by `ReadOnlyTableProps`, `EditableTableProps`, `TableGXTableProps`, and (via the existing `Pick`) `TabbedTableProps`.
  - `TableClassNames.columnJumpDialog?: string`.
  - `TableCoreProps<TRow>` internal-only additions consumed by Task 3: `columnJumpForeignEntries?: ColumnJumpEntry[]`, `onJumpToForeignColumn?: (entry: ColumnJumpEntry) => void`, `scrollToColumnId?: string | null`, `onScrollToColumnHandled?: () => void`.

- [ ] **Step 1: Add the two new props to `AdvancedFeatureProps` and the new `classNames` key**

In `src/types.ts`, inside `AdvancedFeatureProps<TRow>` (right after the existing `columnVisibilityStorageKey?: string` line, i.e. after `enableColumnVisibility?: boolean` / `columnVisibilityStorageKey?: string`):

```ts
  /**
   * Ctrl+G / Cmd+G opens a searchable "jump to column" dialog; selecting an
   * entry scrolls that column into view (and, in a tabbed table, switches to
   * the tab that renders it). Off by default.
   */
  enableColumnJump?: boolean
  /**
   * Whether hidden columns appear in the jump list. Selecting a hidden column
   * un-hides it. Default true.
   */
  columnJumpIncludeHidden?: boolean
```

In `TableClassNames` (right after `recordCount?: string`):

```ts
  /** The Ctrl+G "jump to column" dialog (see `enableColumnJump`). */
  columnJumpDialog?: string
```

- [ ] **Step 2: Add the two props to `TabbedTableProps`'s `Pick`**

In `src/types.ts`, in the `Pick<AdvancedFeatureProps<TRow>, ...>` list inside `TabbedTableProps` (the one currently ending `| 'recordCountLabel'`), add the two new keys:

```ts
} & Pick<
  AdvancedFeatureProps<TRow>,
  | 'enableMultiSort'
  | 'enableRowSelection'
  | 'selectedRowIds'
  | 'onSelectedRowIdsChange'
  | 'enableColumnVisibility'
  | 'enableRowVirtualization'
  | 'enableColumnVirtualization'
  | 'rowHeight'
  | 'enableFooter'
  | 'enableGlobalSearch'
  | 'globalSearch'
  | 'onGlobalSearchChange'
  | 'searchableColumns'
  | 'searchPlaceholder'
  | 'enableRecordCount'
  | 'recordCountPosition'
  | 'recordCountLabel'
  | 'enableColumnJump'
  | 'columnJumpIncludeHidden'
> &
```

- [ ] **Step 3: Write the failing single-table tests**

Create `test/columnJump.test.tsx`:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditableTable } from '../src/components/EditableTable'
import { ReadOnlyTable } from '../src/components/ReadOnlyTable'
import { textColumn } from '../src/lib/columns'
import type { MeasureTextFn } from '../src/types'

type Row = { id: string; name: string; city: string; country: string }

const measure: MeasureTextFn = (text) => text.length * 8

const data: Row[] = [{ id: '1', name: 'Avocado', city: 'Lima', country: 'Peru' }]

const columns = [
  textColumn<Row>('name', 'Name'),
  textColumn<Row>('city', 'City'),
  textColumn<Row>('country', 'Country'),
]

// jsdom has no real layout or scrollTo; give elements a size and a scrollTo
// stub for the duration of `fn`. Mirrors the existing `withElementSize`
// helper already used across this suite (e.g. test/globalSearch.test.tsx).
async function withElementSize(fn: () => Promise<void>) {
  const sizeProps = {
    offsetWidth: { configurable: true, get: () => 800 },
    offsetHeight: { configurable: true, get: () => 400 },
    clientWidth: { configurable: true, get: () => 800 },
    clientHeight: { configurable: true, get: () => 400 },
  }
  const originals = Object.fromEntries(
    Object.keys(sizeProps).map((k) => [
      k,
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, k) ??
        Object.getOwnPropertyDescriptor(Element.prototype, k),
    ]),
  )
  for (const [k, d] of Object.entries(sizeProps)) {
    Object.defineProperty(HTMLElement.prototype, k, d)
  }
  const originalScrollTo = HTMLElement.prototype.scrollTo
  HTMLElement.prototype.scrollTo = vi.fn()
  try {
    await fn()
  } finally {
    for (const k of Object.keys(sizeProps)) {
      const orig = originals[k]
      if (orig) Object.defineProperty(HTMLElement.prototype, k, orig)
      else Reflect.deleteProperty(HTMLElement.prototype, k)
    }
    HTMLElement.prototype.scrollTo = originalScrollTo
  }
}

async function openViaShortcut(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Name/ }))
  await user.keyboard('{Control>}g{/Control}')
}

describe('column jump — single table', () => {
  it('does nothing when enableColumnJump is unset', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(<ReadOnlyTable<Row> data={data} columns={columns} getRowId={(r) => r.id} measure={measure} />)
      await openViaShortcut(user)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('opens on Ctrl+G when focus is inside the table', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
          enableColumnJump
        />,
      )
      await openViaShortcut(user)
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })
  })

  it('does not open when focus is outside the table', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <>
          <button>Outside</button>
          <ReadOnlyTable<Row>
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            measure={measure}
            enableColumnJump
          />
        </>,
      )
      await user.click(screen.getByRole('button', { name: 'Outside' }))
      await user.keyboard('{Control>}g{/Control}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('lists every column and filters as the user types', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
          enableColumnJump
        />,
      )
      await openViaShortcut(user)
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('button', { name: 'City' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Country' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Name' })).toBeInTheDocument()
      await user.type(within(dialog).getByRole('textbox'), 'coun')
      expect(within(dialog).getByRole('button', { name: 'Country' })).toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'Name' })).not.toBeInTheDocument()
    })
  })

  it('excludes hidden columns when columnJumpIncludeHidden is false', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
          enableColumnJump
          enableColumnVisibility
          columnJumpIncludeHidden={false}
        />,
      )
      await user.click(screen.getByRole('button', { name: /Columns/ }))
      await user.click(await screen.findByRole('menuitemcheckbox', { name: 'City' }))
      await waitFor(() => expect(screen.queryByText('Lima')).not.toBeInTheDocument())

      await user.keyboard('{Escape}') // close the Columns menu first
      await openViaShortcut(user)
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByRole('button', { name: /City/ })).not.toBeInTheDocument()
    })
  })

  it('selecting a hidden column un-hides it and scrolls to it (included by default)', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <ReadOnlyTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
          enableColumnJump
          enableColumnVisibility
        />,
      )
      await user.click(screen.getByRole('button', { name: /Columns/ }))
      await user.click(await screen.findByRole('menuitemcheckbox', { name: 'City' }))
      await waitFor(() => expect(screen.queryByText('Lima')).not.toBeInTheDocument())
      await user.keyboard('{Escape}')

      await openViaShortcut(user)
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'CityHidden' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(screen.getByText('Lima')).toBeInTheDocument())
    })
  })
})

describe('column jump — editable table', () => {
  it('opens the same way as ReadOnlyTable', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      render(
        <EditableTable<Row>
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          measure={measure}
          enableColumnJump
          editableColumnIds={['name']}
          onSaveEdit={async () => true}
        />,
      )
      await openViaShortcut(user)
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- test/columnJump.test.tsx`
Expected: FAIL — `enableColumnJump` doesn't exist on the props type yet / the dialog never opens (no listener wired), so the `await screen.findByRole('dialog')` assertions time out.

- [ ] **Step 5: Add the new internal-only props to `TableCoreProps`**

In `src/core/TableCore.tsx`, inside the `& {...}` block of `TableCoreProps<TRow>` (after `pinnedPaneX?: MotionValue<number>`, i.e. right before the closing `}` at what is currently line 157):

```ts
  /** Internal — TabbedTable/IndependentTabbedTable supply every other tab's jump entries. */
  columnJumpForeignEntries?: ColumnJumpEntry[]
  /** Internal — called when the user picks an entry belonging to another tab. */
  onJumpToForeignColumn?: (entry: ColumnJumpEntry) => void
  /** Internal — sent by the tab store after a cross-tab jump switches to this tab. */
  scrollToColumnId?: string | null
  /** Internal — acks a completed `scrollToColumnId` request so the store clears it. */
  onScrollToColumnHandled?: () => void
```

Add `ColumnJumpEntry` to the existing `import type { ... } from '../types'` block (currently lines 50-58) and add the component import right after the other `./` core imports (currently lines 60-66):

```ts
import { ColumnJumpDialog } from './ColumnJumpDialog'
```

- [ ] **Step 6: Destructure the new props**

In the function body's destructure (currently lines 456-515), add after `pinnedPaneX,`:

```ts
    columnJumpForeignEntries,
    onJumpToForeignColumn,
    scrollToColumnId,
    onScrollToColumnHandled,
```

`enableColumnJump` and `columnJumpIncludeHidden` are already destructured implicitly as part of `props` via `ReadOnlyTableProps` — add them explicitly with defaults right after `columnVisibilityStorageKey,`:

```ts
    enableColumnJump = false,
    columnJumpIncludeHidden = true,
```

- [ ] **Step 7: Add the column-jump state, derivations, and effects**

In `src/core/TableCore.tsx`, insert this block right after `const contentWidth = pinnedWidth + scrollTotalWidth` (currently line 924) and before the `// ----- Rows + row virtualization -----` comment:

```ts
  // ----- Column jump (Ctrl+G / Cmd+G) -----

  const columnJumpOwnEntries = useMemo<ColumnJumpEntry[]>(() => {
    if (!enableColumnJump) return []
    return columns
      .filter((c) => c.enableHiding !== false)
      .map((c) => {
        const id = getColumnId(c)
        return {
          columnId: id,
          label: headerLabelOf(c, id, columnLabel),
          hidden: visibility[id] === false,
        }
      })
      .filter((entry) => columnJumpIncludeHidden !== false || !entry.hidden)
  }, [columns, columnLabel, visibility, enableColumnJump, columnJumpIncludeHidden])

  const columnJumpEntries = useMemo<ColumnJumpEntry[]>(
    () => [...columnJumpOwnEntries, ...(columnJumpForeignEntries ?? [])],
    [columnJumpOwnEntries, columnJumpForeignEntries],
  )

  const [columnJumpOpen, setColumnJumpOpen] = useState(false)
  const [pendingJumpColumnId, setPendingJumpColumnId] = useState<string | null>(null)

  // A cross-tab jump lands here once the store switches the active tab to
  // this one and hands this instance the column id via `scrollToColumnId`.
  useEffect(() => {
    if (scrollToColumnId) setPendingJumpColumnId(scrollToColumnId)
  }, [scrollToColumnId])

  const handleColumnJumpSelect = useCallback(
    (entry: ColumnJumpEntry) => {
      if (entry.tabId !== undefined) {
        onJumpToForeignColumn?.(entry)
        return
      }
      setPendingJumpColumnId(entry.columnId)
    },
    [onJumpToForeignColumn],
  )

  // Un-hides (if needed) and scrolls a pending own-column jump into view. When
  // the column starts hidden this runs twice: once to flip visibility, then
  // again once the updated `visibility` re-render puts the column into
  // `scrollColumns` so its offset can be computed.
  useEffect(() => {
    if (!pendingJumpColumnId) return
    const id = pendingJumpColumnId
    if (visibility[id] === false) {
      handleVisibilityChange((prev) => ({ ...prev, [id]: true }))
      return
    }
    if (!frozenColumnIds.has(id)) {
      const index = scrollColumns.findIndex((c) => c.id === id)
      if (index === -1) return
      const el = scrollRef.current
      if (el) {
        const left = colOffsets[index] ?? 0
        const width = scrollWidths[index] ?? 0
        const visibleStart = el.scrollLeft
        const visibleEnd = visibleStart + paneWidth
        if (left < visibleStart || left + width > visibleEnd) {
          el.scrollTo({ left, behavior: 'smooth' })
        }
      }
    }
    setPendingJumpColumnId(null)
    onScrollToColumnHandled?.()
  }, [
    pendingJumpColumnId,
    visibility,
    handleVisibilityChange,
    frozenColumnIds,
    scrollColumns,
    colOffsets,
    scrollWidths,
    paneWidth,
    onScrollToColumnHandled,
  ])

  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!enableColumnJump) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setColumnJumpOpen(true)
      }
    },
    [enableColumnJump],
  )
```

- [ ] **Step 8: Wire the shortcut and dialog into the root JSX**

In `src/core/TableCore.tsx`, in the final `return (...)` (currently lines 1378-1388), add `onKeyDown` to the root `<div>` and mount the dialog as its first child:

```tsx
  return (
    <div
      data-tgx-table=""
      className={cn(
        'relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-card text-card-foreground',
        bordered && 'rounded-md border border-border',
        !maxHeight && 'flex-1',
        classNames?.root,
      )}
      style={maxHeight ? { maxHeight } : undefined}
      onKeyDown={handleTableKeyDown}
    >
      {enableColumnJump && (
        <ColumnJumpDialog
          open={columnJumpOpen}
          onOpenChange={setColumnJumpOpen}
          entries={columnJumpEntries}
          onSelect={handleColumnJumpSelect}
          className={classNames?.columnJumpDialog}
        />
      )}
      {hasToolbarRow && (
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test -- test/columnJump.test.tsx`
Expected: PASS (all 7 tests). If the "un-hides it and scrolls" test's final `waitFor` never resolves, check that `handleVisibilityChange`'s updater form is actually reaching `setStoredVisibility`/`onControlledVisibilityChange` synchronously enough for the effect's second pass to see `visibility[id] !== false` — add a `console.log(visibility)` temporarily inside the effect to confirm the two-pass sequence described in Step 7's comment actually occurs, then remove it once confirmed.

- [ ] **Step 10: Typecheck, run the full suite, and commit**

```bash
npm run typecheck
npm test
git add src/types.ts src/core/TableCore.tsx test/columnJump.test.tsx
git commit -m "feat: wire the column-jump shortcut and dialog into TableCore"
```

---

## Task 3: Cross-tab bridging (`TabbedTable` / `IndependentTabbedTable`)

**Files:**
- Modify: `src/primitives/types.ts` (`TableTabModel`, `TableProviderConfig`, `TableBodyRenderArgs`)
- Modify: `src/primitives/store.tsx`
- Modify: `src/components/TabbedTable.tsx`
- Modify: `src/components/IndependentTabbedTable.tsx`
- Test: Modify `test/columnJump.test.tsx` (add a new `describe` block)

**Interfaces:**
- Consumes: `ColumnJumpEntry` (Task 1); `TableCoreProps.columnJumpForeignEntries` / `onJumpToForeignColumn` / `scrollToColumnId` / `onScrollToColumnHandled` (Task 2).
- Produces: no new public exports — `TabbedTableProps.enableColumnJump`/`columnJumpIncludeHidden` already exist from Task 2's `Pick` update; this task adds the matching fields to `IndependentTabbedTableProps` and makes both components actually forward everything through to the store and `TableCore`.

- [ ] **Step 1: Write the failing cross-tab tests**

Append to `test/columnJump.test.tsx` (new imports go at the top alongside the existing ones — add `TabbedTable` from `'../src/components/TabbedTable'`, `IndependentTabbedTable` and `independentTable` from `'../src/components/IndependentTabbedTable'`, and `TabbedTableTab` from `'../src/types'`):

```tsx
import { IndependentTabbedTable, independentTable } from '../src/components/IndependentTabbedTable'
import { TabbedTable } from '../src/components/TabbedTable'
import type { TabbedTableTab } from '../src/types'

// ... after the existing describe blocks ...

describe('column jump — shared tabbed table', () => {
  const sharedTabs: TabbedTableTab<Row>[] = [
    { id: 'a', label: 'Tab A', columns: [textColumn<Row>('name', 'Name')] },
    { id: 'b', label: 'Tab B', columns: [textColumn<Row>('country', 'Country')] },
  ]

  function activeTable(container: HTMLElement): HTMLElement {
    const panels = container.querySelectorAll<HTMLElement>('[data-tgx-table]')
    return panels[panels.length - 1]!
  }

  it('lists columns from every tab and switches tabs on selection', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const { container } = render(
        <TabbedTable<Row>
          data={data}
          getRowId={(r) => r.id}
          idColumn="id"
          tabs={sharedTabs}
          enableColumnJump
        />,
      )
      await user.click(within(activeTable(container)).getByRole('button', { name: /^Name/ }))
      await user.keyboard('{Control>}g{/Control}')
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('button', { name: 'Name' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: /Country.*Tab B|Tab B.*Country/ })).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: /Country/ }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() =>
        expect(within(activeTable(container)).getByText('Peru')).toBeInTheDocument(),
      )
    })
  })
})

describe('column jump — independent tabbed table', () => {
  type OtherRow = { id: string; total: number }

  function activeTable(container: HTMLElement): HTMLElement {
    const panels = container.querySelectorAll<HTMLElement>('[data-tgx-table]')
    return panels[panels.length - 1]!
  }

  it('switches tabs across independent tables on selection', async () => {
    const user = userEvent.setup()
    await withElementSize(async () => {
      const tabA = independentTable<Row>({
        id: 'a',
        label: 'Tab A',
        data,
        getRowId: (r) => r.id,
        columns: [textColumn<Row>('name', 'Name')],
      })
      const tabB = independentTable<OtherRow>({
        id: 'b',
        label: 'Tab B',
        data: [{ id: '1', total: 42 }],
        getRowId: (r) => r.id,
        columns: [
          {
            id: 'total',
            header: 'Total',
            accessorKey: 'total',
            cell: ({ getValue }) => String(getValue()),
          },
        ],
      })
      const { container } = render(
        <IndependentTabbedTable tabs={[tabA, tabB]} enableColumnJump measure={measure} />,
      )
      await user.click(within(activeTable(container)).getByRole('button', { name: /^Name/ }))
      await user.keyboard('{Control>}g{/Control}')
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: /Total/ }))
      await waitFor(() => expect(within(activeTable(container)).getByText('42')).toBeInTheDocument())
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/columnJump.test.tsx`
Expected: FAIL — the new `describe` blocks time out waiting for the dialog or for the cross-tab content, since `TabbedTable`/`IndependentTabbedTable` don't yet forward `enableColumnJump` anywhere.

- [ ] **Step 3: Add the store-facing types**

In `src/primitives/types.ts`, add `ColumnJumpEntry` to the `import type { ... } from '../types'` block (it already imports several types from `'../types'`).

Add a field to `TableTabModel` (after the existing `columnPreviewLabels` field):

```ts
  /** This tab's jump-list candidates (id + label), built the same way as
   *  `columnPreviewLabels` but gated on `enableColumnJump` instead of
   *  `enableTabColumnPreview`. Empty when column jump is disabled. */
  columnJumpItems: { id: string; label: string }[]
```

Add two fields to `TableProviderConfig` (alongside `tabColumnPreviewDelayMs`/`tabColumnPreviewPosition`):

```ts
  /** Whether the Ctrl+G column-jump dialog is enabled for this table. `TabbedTable` also reads its own `enableColumnJump` prop directly; `IndependentTabbedTable`'s per-tab `TableCore`s read it back via `TableBodyRenderArgs.columnJumpEnabled` below, since `independentTable()`'s `render` closure has no other way to see a container-level prop. */
  enableColumnJump?: boolean
  /** Whether hidden columns appear in the jump list (see `AdvancedFeatureProps.columnJumpIncludeHidden`). Default true. */
  columnJumpIncludeHidden?: boolean
```

Add six fields to `TableBodyRenderArgs` (after `pinnedPaneX`):

```ts
  /** Every other tab's column-jump entries, merged into the active tab's dialog list. */
  columnJumpForeignEntries: ColumnJumpEntry[]
  /** Switches to the entry's tab, un-hiding the column there if needed, and arms `scrollToColumnId` for the newly-active tab. */
  onJumpToForeignColumn: (entry: ColumnJumpEntry) => void
  /** Set once this tab becomes active after a cross-tab jump; the mounted `TableCore` scrolls to it and acks via `onScrollToColumnHandled`. */
  scrollToColumnId: string | null
  onScrollToColumnHandled: () => void
  /** Resolved container-level `enableColumnJump`. `independentTable()`'s `render` reads this (see `TableProviderConfig.enableColumnJump` above); `TabbedTable` reads its own prop directly instead. */
  columnJumpEnabled: boolean
  /** Resolved container-level `columnJumpIncludeHidden` (defaulted to `true`), for the same reason as `columnJumpEnabled`. */
  columnJumpIncludeHiddenResolved: boolean
```

- [ ] **Step 4: Derive column-jump entries and the tab-switch bridge in the store**

In `src/primitives/store.tsx`, destructure `enableColumnJump` and `columnJumpIncludeHidden` from `config` (alongside `enableSortHierarchy`/`resolveSortLabel`).

Add this block after the `getVisibility`/`setVisibility` section (right after the `setVisibility` `useMemo`, before the `// ----- Top-placed record count ...` comment):

```ts
  // ----- Column jump (Ctrl+G / Cmd+G) -----

  const columnJumpEntriesByTab = useMemo(() => {
    const out: Record<string, ColumnJumpEntry[]> = {}
    for (const tab of tabs) {
      if (tab.columnJumpItems.length === 0) {
        out[tab.id] = []
        continue
      }
      const tabVisibility = getVisibility(tab.id)
      out[tab.id] = tab.columnJumpItems
        .map((item) => ({
          columnId: item.id,
          label: item.label,
          hidden: tabVisibility[item.id] === false,
          tabId: tab.id,
          tabLabel: tab.label,
        }))
        .filter((entry) => columnJumpIncludeHidden !== false || !entry.hidden)
    }
    return out
  }, [tabs, getVisibility, columnJumpIncludeHidden])

  const columnJumpForeignEntries = useMemo(
    () =>
      tabs
        .filter((tab) => tab.id !== activeId)
        .flatMap((tab) => columnJumpEntriesByTab[tab.id] ?? []),
    [tabs, activeId, columnJumpEntriesByTab],
  )

  const [pendingScrollColumnId, setPendingScrollColumnId] = useState<string | null>(null)

  const jumpToForeignColumn = useCallback(
    (entry: ColumnJumpEntry) => {
      if (entry.tabId === undefined) return
      if (entry.hidden) {
        const targetTab = tabs.find((t) => t.id === entry.tabId)
        if (targetTab) {
          setVisibility(targetTab)((prev) => ({ ...prev, [entry.columnId]: true }))
        }
      }
      selectTab(entry.tabId)
      setPendingScrollColumnId(entry.columnId)
    },
    [tabs, setVisibility, selectTab],
  )
```

- [ ] **Step 5: Wire the new fields into `getBodyArgs` and the store's exposed value**

In `src/primitives/store.tsx`, inside `getBodyArgs`'s returned object (after `pinnedPaneX,`), add:

```ts
        columnJumpForeignEntries,
        onJumpToForeignColumn: jumpToForeignColumn,
        scrollToColumnId: pendingScrollColumnId,
        onScrollToColumnHandled: () => setPendingScrollColumnId(null),
        columnJumpEnabled: enableColumnJump === true,
        columnJumpIncludeHiddenResolved: columnJumpIncludeHidden ?? true,
```

And add `columnJumpForeignEntries`, `jumpToForeignColumn`, `pendingScrollColumnId`, `enableColumnJump`, `columnJumpIncludeHidden` to `getBodyArgs`'s dependency array (it already lists `measure`, `classNames`, etc. at the end).

- [ ] **Step 6: Build `columnJumpItems` and pass `columnJumpIncludeHidden` through `TabbedTable`**

In `src/components/TabbedTable.tsx`, destructure `enableColumnJump` and `columnJumpIncludeHidden` from `props`.

In the `models` builder, add a field alongside `columnPreviewLabels` (same shape, but gated on `enableColumnJump` and carrying ids):

```ts
        columnJumpItems:
          enableColumnJump !== true
            ? []
            : tab.columns
                .map((c) => c as ColumnDef<TRow, unknown>)
                .filter((c) => c.enableHiding !== false)
                .map((c) => {
                  const id = getColumnId(c)
                  return { id, label: columnLabelFor(tab, id) }
                }),
```

Add `enableColumnJump` to the `models` `useMemo`'s dependency array.

In each tab's `render`, forward the bridging props to `<TableCore>` (alongside the other `args.*` passthroughs):

```tsx
            enableColumnJump={enableColumnJump}
            columnJumpIncludeHidden={columnJumpIncludeHidden ?? true}
            columnJumpForeignEntries={args.columnJumpForeignEntries}
            onJumpToForeignColumn={args.onJumpToForeignColumn}
            scrollToColumnId={args.scrollToColumnId}
            onScrollToColumnHandled={args.onScrollToColumnHandled}
```

On `<Table.Provider>`, add:

```tsx
      enableColumnJump={enableColumnJump}
      columnJumpIncludeHidden={columnJumpIncludeHidden ?? true}
```

- [ ] **Step 7: Do the same for `IndependentTabbedTable`**

Unlike `TabbedTable`, `independentTable()`'s `render` closure is defined once per tab, at tab-construction time, with no visibility into the container-level `enableColumnJump`/`columnJumpIncludeHidden` props (those are only known inside the `IndependentTabbedTable` component, and `tab.render(args)` is called with exactly one argument — see `activeTab?.render(getBodyArgs(pinnedPaneX))` in `src/primitives/TablePanels.tsx`). So for this component, `enableColumnJump`/`columnJumpIncludeHidden` must reach `render` through `TableBodyRenderArgs` (`columnJumpEnabled`/`columnJumpIncludeHiddenResolved`, added in Step 3) instead of being passed as literal props the way `TabbedTable` does in Step 6.

In `src/components/IndependentTabbedTable.tsx`, add to `IndependentTabbedTableProps`:

```ts
  /** Ctrl+G "jump to column" dialog, spanning all tabs. Default false. */
  enableColumnJump?: boolean
  /** Whether hidden columns appear in the jump list. Default true. */
  columnJumpIncludeHidden?: boolean
```

In `independentTable()`, add a field alongside `columnPreviewLabels` (always build the full list here — gating happens in `tabsForStore` below, same idiom as `columnPreviewLabels`):

```ts
    columnJumpItems: config.columns
      .map((c) => c as ColumnDef<TRow, unknown>)
      .filter((c) => c.enableHiding !== false)
      .map((c) => {
        const id = getColumnId(c)
        return { id, label: columnLabelOf(config, id) }
      }),
```

In each tab's `render` inside `independentTable()`, forward the bridging props, reading the two container-level flags off `args` (not off `config`, which has no access to them):

```tsx
            enableColumnJump={args.columnJumpEnabled}
            columnJumpIncludeHidden={args.columnJumpIncludeHiddenResolved}
            columnJumpForeignEntries={args.columnJumpForeignEntries}
            onJumpToForeignColumn={args.onJumpToForeignColumn}
            scrollToColumnId={args.scrollToColumnId}
            onScrollToColumnHandled={args.onScrollToColumnHandled}
```

In the `IndependentTabbedTable` component, destructure `enableColumnJump`, `columnJumpIncludeHidden` from props. Extend the existing `tabsForStore` line (currently only handling `columnPreviewLabels`) to also gate `columnJumpItems`:

```ts
  const tabsForStore = tabs.map((t) => ({
    ...t,
    columnPreviewLabels: enableTabColumnPreview === true ? t.columnPreviewLabels : [],
    columnJumpItems: enableColumnJump === true ? t.columnJumpItems : [],
  }))
```

(This replaces the current single-purpose `tabsForStore` ternary line.)

On `<Table.Provider>`, add:

```tsx
      enableColumnJump={enableColumnJump === true}
      columnJumpIncludeHidden={columnJumpIncludeHidden ?? true}
```

`TabbedTable.tsx` (Step 6) doesn't need `columnJumpEnabled`/`columnJumpIncludeHiddenResolved` — it already has its own `enableColumnJump`/`columnJumpIncludeHidden` props in scope and passes them straight to `<TableCore>`. Still pass `enableColumnJump={enableColumnJump}` there too when adding `columnJumpIncludeHidden` to `<Table.Provider>` in Step 6, so the store's resolved values stay correct for both modes uniformly (nothing currently reads them back for shared mode, but this keeps the two components symmetric).

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- test/columnJump.test.tsx`
Expected: PASS (all 9 tests across all three `describe` blocks).

- [ ] **Step 9: Run the full suite and typecheck**

```bash
npm run typecheck
npm test
```

Expected: all existing tests still pass (no regressions in `test/tabbedTable.test.tsx`, `test/independentTabbedTable.test.tsx`, etc. — the new fields are additive and default-gated).

- [ ] **Step 10: Commit**

```bash
git add src/primitives/types.ts src/primitives/store.tsx src/components/TabbedTable.tsx src/components/IndependentTabbedTable.tsx test/columnJump.test.tsx
git commit -m "feat: bridge the column-jump dialog across tabs in TabbedTable/IndependentTabbedTable"
```

---

## Self-Review Notes

- **Spec coverage:** Scope (all 4 surfaces) → Tasks 2+3. Shortcut scoping → Task 2 Step 7/8 (`onKeyDown` on the root wrapper). Dialog UI → Task 1. Hidden-columns default + override → Task 2 Step 1 (`AdvancedFeatureProps`) and Step 3 tests. Jump mechanics (own vs. foreign, unhide+scroll, pending-id handshake) → Task 2 Step 7 and Task 3 Steps 4–7. Edge cases from the spec (column on multiple tabs, rapid re-selection, disabled-by-default) are exercised implicitly by the tab-badge test (Task 1) and the enable/disable tests (Task 2) — rapid re-selection isn't given its own test since it only exercises a state overwrite with no new logic path.
- **Type consistency:** `ColumnJumpEntry` shape is identical everywhere it's used (Task 1 definition, Task 2's `TableCoreProps`, Task 3's `TableBodyRenderArgs`/store). `columnJumpItems: {id, label}[]` naming matches between `TableTabModel` (Task 3 Step 3) and both builders (Task 3 Steps 6–7). `onJumpToForeignColumn`/`scrollToColumnId`/`onScrollToColumnHandled` names match exactly between `TableCoreProps` (Task 2) and `TableBodyRenderArgs`/store (Task 3).
- **Placeholder scan:** no TBD/TODO markers; every code block is complete and directly copy-pasteable. The one asymmetry worth flagging explicitly (not a placeholder, a deliberate design choice) is that `independentTable()`'s `render` reads `enableColumnJump`/`columnJumpIncludeHidden` back off `args.columnJumpEnabled`/`args.columnJumpIncludeHiddenResolved` (Task 3 Step 7) while `TabbedTable`'s `render` uses its own closed-over props directly (Task 3 Step 6) — both are correct; the difference exists only because `independentTable()`'s `render` closure is built before the container component's props are in scope, while `TabbedTable`'s tab `render` closures are built inside the component body where the props are already available.
