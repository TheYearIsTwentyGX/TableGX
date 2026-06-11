import type { ColumnDef } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { Badge } from '../ui/badge'
import type { CellRenderContext, TableColumnMeta, TableRowData } from '../types'
import { formatDateSafe } from './date'
import { tgxFilterFn } from './filtering'

/** Text column: stringifies the value, filterable with the default filter. */
export function textColumn<TRow extends TableRowData>(
  id: string,
  header: string,
  meta?: TableColumnMeta,
): ColumnDef<TRow, unknown> {
  return {
    id,
    header,
    accessorKey: id,
    cell: ({ getValue }) => String(getValue() ?? ''),
    enableColumnFilter: true,
    filterFn: tgxFilterFn,
    meta,
  } as ColumnDef<TRow, unknown>
}

/** Number column: locale-formatted display. */
export function numberColumn<TRow extends TableRowData>(
  id: string,
  header: string,
  meta?: TableColumnMeta,
): ColumnDef<TRow, unknown> {
  return {
    id,
    header,
    accessorKey: id,
    cell: ({ getValue }) => {
      const v = getValue()
      if (v === null || v === undefined || v === '') return ''
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) ? n.toLocaleString() : String(v)
    },
    enableColumnFilter: true,
    filterFn: tgxFilterFn,
    meta: { inputType: 'number', ...meta },
  } as ColumnDef<TRow, unknown>
}

/** Boolean column: BodyCell renders the Yes/No checkbox affordance via meta.inputType. */
export function booleanColumn<TRow extends TableRowData>(
  id: string,
  header: string,
  meta?: TableColumnMeta,
): ColumnDef<TRow, unknown> {
  return {
    id,
    header,
    accessorKey: id,
    cell: ({ getValue }) => String(getValue() ?? ''),
    enableColumnFilter: true,
    filterFn: tgxFilterFn,
    meta: { inputType: 'boolean', ...meta },
  } as ColumnDef<TRow, unknown>
}

/** Select column: displays the option label matching the value. */
export function selectColumn<TRow extends TableRowData>(
  id: string,
  header: string,
  options: { label: string; value: string }[],
  meta?: TableColumnMeta,
): ColumnDef<TRow, unknown> {
  const labelFor = (value: unknown) => {
    const str = String(value ?? '')
    return options.find((o) => o.value === str)?.label ?? str
  }
  return {
    id,
    header,
    accessorKey: id,
    cell: ({ getValue }) => labelFor(getValue()),
    enableColumnFilter: true,
    filterFn: tgxFilterFn,
    meta: {
      inputType: 'select',
      selectOptions: options,
      measureText: (row) => labelFor(row[id]),
      ...meta,
    },
  } as ColumnDef<TRow, unknown>
}

/** Date column: timezone-safe MM/dd/yyyy display. */
export function dateColumn<TRow extends TableRowData>(
  id: string,
  header: string,
  meta?: TableColumnMeta,
): ColumnDef<TRow, unknown> {
  return {
    id,
    header,
    accessorKey: id,
    cell: ({ getValue }) => formatDateSafe(getValue()),
    enableColumnFilter: true,
    filterFn: tgxFilterFn,
    meta: { measureText: (row) => formatDateSafe(row[id]), ...meta },
  } as ColumnDef<TRow, unknown>
}

/** Badge column: renders the value inside a Badge. */
export function badgeColumn<TRow extends TableRowData>(
  id: string,
  header: string,
  meta?: TableColumnMeta,
): ColumnDef<TRow, unknown> {
  return {
    id,
    header,
    accessorKey: id,
    cell: ({ getValue }) => {
      const v = getValue()
      if (v === null || v === undefined || v === '') return null
      return <Badge variant="secondary">{String(v)}</Badge>
    },
    enableColumnFilter: true,
    filterFn: tgxFilterFn,
    meta: { measureText: (row) => String(row[id] ?? ''), ...meta },
  } as ColumnDef<TRow, unknown>
}

/**
 * Custom column: full control over cell content via a render function that
 * receives a {@link CellRenderContext}. Rendered through `meta.renderCell`, so
 * the value area opts out of truncation and is horizontally flexible — multi-
 * element layouts (e.g. several badges) and interactive controls (e.g. a
 * popover trigger) render unclipped, side by side. Mirrors the other factories
 * (spreads `meta` last).
 *
 * Because the rendered content is arbitrary, auto-sizing can't infer a width
 * from the raw value — pass `meta.measureText` or `meta.fixedMeasureWidth` to
 * size the column. The `id` is used as the accessor key for sorting/filtering;
 * if it isn't a real row field, supply `meta` accordingly.
 */
export function customColumn<TRow extends TableRowData>(
  id: string,
  header: string,
  render: (ctx: CellRenderContext<TRow>) => ReactNode,
  meta?: TableColumnMeta,
): ColumnDef<TRow, unknown> {
  return {
    id,
    header,
    accessorKey: id,
    enableColumnFilter: true,
    filterFn: tgxFilterFn,
    meta: { renderCell: render as TableColumnMeta['renderCell'], ...meta },
  } as ColumnDef<TRow, unknown>
}
