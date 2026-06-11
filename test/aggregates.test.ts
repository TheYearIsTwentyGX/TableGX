import { describe, expect, it } from 'vitest'
import { computeAggregate, formatAggregate } from '../src/lib/aggregates'

describe('computeAggregate', () => {
  it('sums numeric values, ignoring non-numeric', () => {
    expect(computeAggregate('sum', [1, 2, 'x', null, '3'])).toBe(6)
  })

  it('averages numeric values', () => {
    expect(computeAggregate('avg', [2, 4, 'junk'])).toBe(3)
  })

  it('computes min and max', () => {
    expect(computeAggregate('min', [5, -1, 3])).toBe(-1)
    expect(computeAggregate('max', [5, -1, 3])).toBe(5)
  })

  it('counts non-empty values', () => {
    expect(computeAggregate('count', ['a', '', null, undefined, 0, false])).toBe(3)
  })

  it('returns null when no numeric value participates', () => {
    expect(computeAggregate('sum', ['a', null, undefined])).toBeNull()
  })
})

describe('formatAggregate', () => {
  it('defaults to toLocaleString', () => {
    expect(formatAggregate(1234567)).toBe((1234567).toLocaleString())
  })

  it('uses the provided formatter', () => {
    expect(formatAggregate(2, (v) => `$${v.toFixed(2)}`)).toBe('$2.00')
  })
})
