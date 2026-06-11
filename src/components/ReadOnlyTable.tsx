import { TableCore } from '../core/TableCore'
import type { ReadOnlyTableProps, TableRowData } from '../types'

/** Display-only grid: TableCore with `editable={false}` (spec §4). */
export function ReadOnlyTable<TRow extends TableRowData>(props: ReadOnlyTableProps<TRow>) {
  return <TableCore<TRow> {...props} editable={false} />
}
