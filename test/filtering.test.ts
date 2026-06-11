import { describe, expect, it } from 'vitest'
import { isEmptyFilterValue, matchesFilterValue } from '../src/lib/filtering'

describe('matchesFilterValue', () => {
  it('matches case-insensitive includes on text', () => {
    expect(matchesFilterValue('Hello World', { text: 'world', checkedValues: null })).toBe(true)
    expect(matchesFilterValue('Hello', { text: 'nope', checkedValues: null })).toBe(false)
  })

  it('restricts to checked values', () => {
    const checked = new Set(['A', 'B'])
    expect(matchesFilterValue('A', { text: '', checkedValues: checked })).toBe(true)
    expect(matchesFilterValue('C', { text: '', checkedValues: checked })).toBe(false)
  })

  it('combines text and checklist (AND)', () => {
    const checked = new Set(['Apple', 'Banana'])
    expect(matchesFilterValue('Apple', { text: 'app', checkedValues: checked })).toBe(true)
    expect(matchesFilterValue('Banana', { text: 'app', checkedValues: checked })).toBe(false)
  })

  it('treats null/undefined cell values as empty strings', () => {
    expect(matchesFilterValue(null, { text: '', checkedValues: new Set(['']) })).toBe(true)
  })
})

describe('isEmptyFilterValue', () => {
  it('detects empty values', () => {
    expect(isEmptyFilterValue(undefined)).toBe(true)
    expect(isEmptyFilterValue({ text: '', checkedValues: null })).toBe(true)
    expect(isEmptyFilterValue({ text: 'x', checkedValues: null })).toBe(false)
    expect(isEmptyFilterValue({ text: '', checkedValues: new Set() })).toBe(false)
  })
})
