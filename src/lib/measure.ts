import { measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext'
import type { MeasureTextFn } from '../types'

/** Default cell text font. Matches the table body's `text-sm` Tailwind class. */
export const CELL_FONT =
  "14px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/** Header label font (`text-sm font-medium`). */
export const HEADER_FONT =
  "500 14px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const widthCache = new Map<string, number>()
/**
 * Cache cap so high-churn data (unique ids, timestamps) can't grow the cache
 * without bound over an app's lifetime. Eviction is FIFO — Map preserves
 * insertion order, so the oldest entry is always first.
 */
const WIDTH_CACHE_MAX_ENTRIES = 10_000

function approximateWidth(text: string, font: string): number {
  // Used when canvas measurement is unavailable (e.g. jsdom without canvas).
  const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(font)
  const fontSize = sizeMatch ? Number(sizeMatch[1]) : 14
  return text.length * fontSize * 0.6
}

/**
 * DOM-free text measurement backed by @chenglou/pretext. `prepare` work is
 * cached per (font, text) pair, so repeated measurements are arithmetic-only.
 */
export const measureTextWidth: MeasureTextFn = (text, font) => {
  if (text === '') return 0
  const key = `${font}\u0000${text}`
  const cached = widthCache.get(key)
  if (cached !== undefined) return cached
  let width: number
  try {
    width = measureNaturalWidth(prepareWithSegments(text, font))
  } catch {
    width = approximateWidth(text, font)
  }
  if (widthCache.size >= WIDTH_CACHE_MAX_ENTRIES) {
    const oldest = widthCache.keys().next().value
    if (oldest !== undefined) widthCache.delete(oldest)
  }
  widthCache.set(key, width)
  return width
}

/**
 * Builds a canvas `font` shorthand from an element's computed style so text is
 * measured in the font the browser actually paints (the library sets no
 * `font-family`, so cells inherit the consumer's font). Returns `fallback` when
 * the element is missing or computed style is unavailable (e.g. SSR).
 */
export function fontFromElement(el: Element | null, fallback: string): string {
  if (!el || typeof getComputedStyle === 'undefined') return fallback
  try {
    const cs = getComputedStyle(el)
    const family = cs.fontFamily
    if (!family) return fallback
    const parts: string[] = []
    if (cs.fontStyle && cs.fontStyle !== 'normal') parts.push(cs.fontStyle)
    if (cs.fontWeight && cs.fontWeight !== 'normal' && cs.fontWeight !== '400') {
      parts.push(cs.fontWeight)
    }
    parts.push(cs.fontSize || '14px')
    parts.push(family)
    return parts.join(' ')
  } catch {
    return fallback
  }
}

/** True when canvas-based measurement can run (i.e. not during SSR). */
export function canMeasureText(): boolean {
  if (typeof document === 'undefined') return false
  try {
    return document.createElement('canvas').getContext('2d') !== null
  } catch {
    return false
  }
}
