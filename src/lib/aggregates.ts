import type { FooterAggregate } from '../types'

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function isNonEmpty(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ''
}

/**
 * Computes a footer aggregate over items via an accessor, so callers can pass
 * rows directly instead of materializing an intermediate values array per
 * column. Numeric aggregates ignore non-numeric values; `count` tallies
 * non-empty values. Returns null when no value participates (so the caller can
 * render nothing).
 */
export function computeAggregateOver<T>(
  kind: FooterAggregate,
  items: readonly T[],
  getValue: (item: T) => unknown,
): number | null {
  if (kind === 'count') {
    let tally = 0
    for (const item of items) {
      if (isNonEmpty(getValue(item))) tally++
    }
    return tally
  }
  // Single pass, no intermediate array: spreading into Math.min/max overflows
  // the call stack once the filtered set grows past engine argument limits.
  let count = 0
  let sum = 0
  let min = Infinity
  let max = -Infinity
  for (const item of items) {
    const n = toNumber(getValue(item))
    if (n === null) continue
    count++
    sum += n
    if (n < min) min = n
    if (n > max) max = n
  }
  if (count === 0) return null
  switch (kind) {
    case 'sum':
      return sum
    case 'avg':
      return sum / count
    case 'min':
      return min
    case 'max':
      return max
  }
}

/** Computes a footer aggregate over raw cell values. */
export function computeAggregate(kind: FooterAggregate, values: unknown[]): number | null {
  return computeAggregateOver(kind, values, (v) => v)
}

/** Default footer formatter. */
export function formatAggregate(value: number, format?: (value: number) => string): string {
  return format ? format(value) : value.toLocaleString()
}
