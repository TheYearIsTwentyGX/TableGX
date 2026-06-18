import { describe, expect, it } from 'vitest'
import type { Row } from '@tanstack/react-table'
import {
  isEmptyFilterValue,
  matchesFilterValue,
  matchesGlobalSearch,
  tgxGlobalFilterFn,
} from '../src/lib/filtering'

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

describe('matchesGlobalSearch', () => {
  it('matches case-insensitively on includes', () => {
    expect(matchesGlobalSearch('Hello World', 'world')).toBe(true)
    expect(matchesGlobalSearch('Hello World', 'WOR')).toBe(true)
    expect(matchesGlobalSearch('Hello', 'nope')).toBe(false)
  })

  it('coerces non-string cell values', () => {
    expect(matchesGlobalSearch(1234, '23')).toBe(true)
    expect(matchesGlobalSearch(true, 'tru')).toBe(true)
  })

  it('treats null/undefined cells as empty', () => {
    expect(matchesGlobalSearch(null, 'x')).toBe(false)
    expect(matchesGlobalSearch(undefined, 'x')).toBe(false)
  })

  it('matches everything for an empty query', () => {
    expect(matchesGlobalSearch('anything', '')).toBe(true)
    expect(matchesGlobalSearch(null, '')).toBe(true)
  })
})

describe('tgxGlobalFilterFn', () => {
  const rowFor = (value: unknown): Row<Record<string, unknown>> =>
    ({ getValue: () => value }) as unknown as Row<Record<string, unknown>>

  it('keeps a row when the column value includes the query', () => {
    expect(tgxGlobalFilterFn(rowFor('Avocado'), 'name', 'voc', () => {})).toBe(true)
    expect(tgxGlobalFilterFn(rowFor('Avocado'), 'name', 'zzz', () => {})).toBe(false)
  })

  it('keeps every row when the query is empty', () => {
    expect(tgxGlobalFilterFn(rowFor('Avocado'), 'name', '', () => {})).toBe(true)
  })
})
