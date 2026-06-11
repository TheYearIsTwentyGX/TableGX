import { TableCore } from '../core/TableCore'
import type { EditableTableProps, TableRowData } from '../types'

/** Inline-editing grid: TableCore with `editable={true}` (spec §4, §7). */
export function EditableTable<TRow extends TableRowData>(props: EditableTableProps<TRow>) {
  return <TableCore<TRow> {...props} editable={true} />
}
