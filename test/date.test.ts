import { describe, expect, it } from 'vitest'
import { formatDateSafe, parseDateSafe } from '../src/lib/date'

describe('parseDateSafe', () => {
  it('parses YYYY-MM-DD at midnight UTC', () => {
    const d = parseDateSafe('2024-03-01')!
    expect(d.getUTCFullYear()).toBe(2024)
    expect(d.getUTCMonth()).toBe(2)
    expect(d.getUTCDate()).toBe(1)
    expect(d.getUTCHours()).toBe(0)
  })

  it('returns null for invalid input', () => {
    expect(parseDateSafe('not a date')).toBeNull()
    expect(parseDateSafe(null)).toBeNull()
    expect(parseDateSafe(undefined)).toBeNull()
  })
})

describe('formatDateSafe', () => {
  it('formats date-only strings without timezone shift', () => {
    // The classic off-by-one: new Date('2024-01-01') in UTC-6 renders as 12/31.
    expect(formatDateSafe('2024-01-01')).toBe('01/01/2024')
    expect(formatDateSafe('1999-12-31')).toBe('12/31/1999')
  })

  it('returns empty string for unparseable values', () => {
    expect(formatDateSafe('garbage')).toBe('')
    expect(formatDateSafe(null)).toBe('')
  })
})
