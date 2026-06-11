import { measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext'
import type { MeasureTextFn } from '../types'

/** Default cell text font. Matches the table body's `text-sm` Tailwind class. */
export const CELL_FONT =
  "14px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/** Header label font (`text-sm font-medium`). */
export const HEADER_FONT =
  "500 14px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const widthCache = new Map<string, number>()

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
  widthCache.set(key, width)
  return width
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
