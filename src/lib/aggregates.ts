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
 * Computes a footer aggregate over raw cell values. Numeric aggregates ignore
 * non-numeric values; `count` tallies non-empty values. Returns null when no
 * value participates (so the caller can render nothing).
 */
export function computeAggregate(kind: FooterAggregate, values: unknown[]): number | null {
  if (kind === 'count') {
    return values.reduce<number>((acc, v) => (isNonEmpty(v) ? acc + 1 : acc), 0)
  }
  const numbers: number[] = []
  for (const value of values) {
    const n = toNumber(value)
    if (n !== null) numbers.push(n)
  }
  if (numbers.length === 0) return null
  switch (kind) {
    case 'sum':
      return numbers.reduce((a, b) => a + b, 0)
    case 'avg':
      return numbers.reduce((a, b) => a + b, 0) / numbers.length
    case 'min':
      return Math.min(...numbers)
    case 'max':
      return Math.max(...numbers)
  }
}

/** Default footer formatter. */
export function formatAggregate(value: number, format?: (value: number) => string): string {
  return format ? format(value) : value.toLocaleString()
}
