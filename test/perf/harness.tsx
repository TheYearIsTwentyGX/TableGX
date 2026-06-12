import {
  badgeColumn,
  dateColumn,
  numberColumn,
  textColumn,
} from '../../src/lib/columns'
import type { ColumnDef } from '@tanstack/react-table'
import type { MeasureTextFn } from '../../src/types'
import { PERF_COLS, PERF_ROWS } from './thresholds'

export type PerfRow = { id: string } & Record<string, string | number>

/** Representative width heuristic shared by every perf benchmark. */
export const perfMeasure: MeasureTextFn = (text) => text.length * 8

const KINDS = ['text', 'number', 'date', 'badge'] as const

/**
 * Deterministic 1000x50 dataset (configurable) built from the real column
 * helpers, with a representative mix of cell types. Deterministic so the
 * rendered window — and therefore the benchmark — is reproducible run to run.
 */
export function makeDataset(rowCount = PERF_ROWS, colCount = PERF_COLS) {
  const columns = Array.from({ length: colCount }, (_, c) => {
    const id = `col${c}`
    const header = `Col ${c}`
    switch (KINDS[c % KINDS.length]) {
      case 'number':
        return numberColumn<PerfRow>(id, header)
      case 'date':
        return dateColumn<PerfRow>(id, header)
      case 'badge':
        return badgeColumn<PerfRow>(id, header)
      default:
        return textColumn<PerfRow>(id, header)
    }
  }) as ColumnDef<PerfRow, unknown>[]

  const data: PerfRow[] = Array.from({ length: rowCount }, (_, r) => {
    const row: PerfRow = { id: String(r) }
    for (let c = 0; c < colCount; c++) {
      const id = `col${c}`
      switch (KINDS[c % KINDS.length]) {
        case 'number':
          row[id] = (r * 31 + c * 7) % 10000
          break
        case 'date': {
          const month = String((c % 12) + 1).padStart(2, '0')
          const day = String((r % 28) + 1).padStart(2, '0')
          row[id] = `2024-${month}-${day}`
          break
        }
        case 'badge':
          row[id] = `B${(r + c) % 5}`
          break
        default:
          row[id] = `r${r}c${c}`
      }
    }
    return row
  })

  return { data, columns }
}

// ----- DOM window inspection (works in jsdom and a real browser) ------------

/** Number of body cells currently rendered in the DOM. */
export function countRenderedCells(root: ParentNode): number {
  return root.querySelectorAll('[data-tgx-cell]').length
}

/** Number of body rows currently rendered in the DOM. */
export function countRenderedRows(root: ParentNode): number {
  return root.querySelectorAll('[data-tgx-row]').length
}

/** Set of row ids currently in the DOM (shifts under vertical scroll). */
export function renderedRowIds(root: ParentNode): Set<string> {
  return new Set(
    Array.from(root.querySelectorAll<HTMLElement>('[data-tgx-row]')).map(
      (el) => el.getAttribute('data-tgx-row') ?? '',
    ),
  )
}

/** Set of column ids currently in the DOM (shifts under horizontal scroll). */
export function renderedColumnIds(root: ParentNode): Set<string> {
  return new Set(
    Array.from(root.querySelectorAll<HTMLElement>('[data-tgx-cell]')).map(
      (el) => el.getAttribute('data-tgx-cell') ?? '',
    ),
  )
}

/** Whether two sets differ (i.e. the rendered window actually shifted). */
export function setsDiffer(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return true
  for (const v of a) if (!b.has(v)) return true
  return false
}

// ----- Timing -------------------------------------------------------------

export function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Runs `fn` `warmup` times (discarded, to let JIT/caches settle), then `runs`
 * timed times, returning the median elapsed ms. Reduces noise so a single slow
 * GC pause can't trip a budget.
 */
export function timeMedian(
  fn: () => void,
  { warmup = 2, runs = 5 }: { warmup?: number; runs?: number } = {},
): number {
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    fn()
    samples.push(performance.now() - start)
  }
  return median(samples)
}

// ----- jsdom element sizing + scroll mock ---------------------------------

/**
 * jsdom reports zero-sized, non-scrollable elements, so the virtualizer (which
 * reads offset/client sizes and scrollTop/scrollLeft) renders nothing and
 * never scrolls. This gives every element a fixed viewport size and makes
 * scrollTop/scrollLeft real, mutable backing values, so the row virtualizer
 * (reads scrollTop) and the column virtualization (reads scrollLeft) respond
 * to programmatic scrolling. Returns a restore fn — call it in `finally`.
 *
 * Mirrors the `withElementSize` pattern in readOnlyTable.test.tsx, extended
 * with scroll support. jsdom-only; not used by the real-browser bench.
 */
export function installJsdomViewport({
  width,
  height,
}: {
  width: number
  height: number
}): () => void {
  const sizeProps: Record<string, PropertyDescriptor> = {
    offsetWidth: { configurable: true, get: () => width },
    offsetHeight: { configurable: true, get: () => height },
    clientWidth: { configurable: true, get: () => width },
    clientHeight: { configurable: true, get: () => height },
  }

  const scrollStore = new WeakMap<HTMLElement, { top: number; left: number }>()
  const slot = (el: HTMLElement) => {
    let s = scrollStore.get(el)
    if (!s) {
      s = { top: 0, left: 0 }
      scrollStore.set(el, s)
    }
    return s
  }
  const scrollProps: Record<string, PropertyDescriptor> = {
    scrollTop: {
      configurable: true,
      get(this: HTMLElement) {
        return slot(this).top
      },
      set(this: HTMLElement, v: number) {
        slot(this).top = v
      },
    },
    scrollLeft: {
      configurable: true,
      get(this: HTMLElement) {
        return slot(this).left
      },
      set(this: HTMLElement, v: number) {
        slot(this).left = v
      },
    },
  }

  const all = { ...sizeProps, ...scrollProps }
  const originals = Object.fromEntries(
    Object.keys(all).map((k) => [
      k,
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, k) ??
        Object.getOwnPropertyDescriptor(Element.prototype, k),
    ]),
  )
  for (const [k, d] of Object.entries(all)) {
    Object.defineProperty(HTMLElement.prototype, k, d)
  }

  return () => {
    for (const k of Object.keys(all)) {
      const orig = originals[k]
      if (orig) Object.defineProperty(HTMLElement.prototype, k, orig)
      else Reflect.deleteProperty(HTMLElement.prototype, k)
    }
  }
}

/** The table's scroll container (the element the virtualizers observe). */
export function getScrollContainer(root: ParentNode): HTMLElement {
  const el = root.querySelector<HTMLElement>('.tgx-scrollbar')
  if (!el) throw new Error('no scroll container rendered')
  return el
}
