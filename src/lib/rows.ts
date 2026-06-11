import type { TableRowData } from '../types'

export type FlatRow<TRow> = { row: TRow; depth: number }

/**
 * Depth-first flatten of a nested row tree. `limit` bounds the number of
 * visited nodes so huge trees stay cheap to sample.
 */
export function flattenWithDepth<TRow extends TableRowData>(
  rows: TRow[],
  getSubRows?: (row: TRow) => TRow[] | undefined,
  limit = Number.POSITIVE_INFINITY,
): FlatRow<TRow>[] {
  const out: FlatRow<TRow>[] = []
  const visit = (list: TRow[], depth: number) => {
    for (const row of list) {
      if (out.length >= limit) return
      out.push({ row, depth })
      const subRows = getSubRows?.(row)
      if (subRows && subRows.length > 0) visit(subRows, depth + 1)
    }
  }
  visit(rows, 0)
  return out
}

/** Collects every descendant id of a row tree node (excluding the node itself). */
export function collectDescendantIds<TRow extends TableRowData>(
  row: TRow,
  getRowId: (row: TRow) => string | number,
  getSubRows?: (row: TRow) => TRow[] | undefined,
): string[] {
  const ids: string[] = []
  const visit = (node: TRow) => {
    const subRows = getSubRows?.(node)
    if (!subRows) return
    for (const child of subRows) {
      ids.push(String(getRowId(child)))
      visit(child)
    }
  }
  visit(row)
  return ids
}
