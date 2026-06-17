import { TableCore } from '../core/TableCore'
import { Table } from '../primitives'
import type { TableGXTableProps, TableRowData, TabbedTableProps } from '../types'
import { TabbedTable } from './TabbedTable'
import {
  IndependentTabbedTable,
  type IndependentTabbedTableProps,
} from './IndependentTabbedTable'

/** Single-table mode: read-only or editable, flipped live via `editable`. */
export type TableGXTableVariantProps<TRow extends TableRowData> = {
  variant: 'table'
} & TableGXTableProps<TRow>

/** Shared-dataset tabs (cross-tab filter intersection, shared selection/sort). */
export type TableGXTabbedVariantProps<TRow extends TableRowData> = {
  variant: 'tabbed'
} & TabbedTableProps<TRow>

/** Fully independent per-tab tables (nothing shared but the tab strip). */
export type TableGXIndependentVariantProps = {
  variant: 'independent'
} & IndependentTabbedTableProps

/**
 * The discriminated prop union for {@link TableGX}. The `variant` discriminator
 * selects the mode and narrows the surface to exactly that mode's props, so
 * autocomplete never offers nonsensical cross-variant combinations.
 */
export type TableGXProps<TRow extends TableRowData = TableRowData> =
  | TableGXTableVariantProps<TRow>
  | TableGXTabbedVariantProps<TRow>
  | TableGXIndependentVariantProps

function isProd(): boolean {
  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
  return env?.NODE_ENV === 'production'
}

/**
 * `TableGX` is the single, recommended entry point to the library. It is a thin
 * **preset facade** over the compound primitives + shared headless store: one
 * import reaches every table mode through a discriminated `variant` prop, with
 * no parallel state logic of its own.
 *
 * - `variant="table"` — one table, read-only or editable. Pass a controllable
 *   `editable` boolean to flip inline editing on/off live (no remount).
 * - `variant="tabbed"` — many views over one shared dataset (shared selection +
 *   cross-tab filter intersection + shared sorting).
 * - `variant="independent"` — fully independent per-tab tables.
 *
 * Need to rearrange the chrome (move the toolbar, split the tab strip, etc.)?
 * Drop down to the primitives — `TableGX.Provider`, `TableGX.TabStrip`,
 * `TableGX.Panels`, … (the same family as the standalone `Table` namespace).
 */
export function TableGX<TRow extends TableRowData = TableRowData>(
  props: TableGXProps<TRow>,
) {
  if (props.variant === 'tabbed') {
    const { variant: _variant, ...rest } = props
    return <TabbedTable<TRow> {...(rest as TabbedTableProps<TRow>)} />
  }

  if (props.variant === 'independent') {
    const { variant: _variant, ...rest } = props
    return <IndependentTabbedTable {...(rest as IndependentTabbedTableProps)} />
  }

  const { variant: _variant, editable = false, ...rest } = props

  if (!isProd() && editable) {
    if (typeof props.onSaveEdit !== 'function') {
      console.warn(
        '[TableGX] `editable` is true but `onSaveEdit` is missing — edits cannot be committed. Provide `onSaveEdit` (and `editableColumnIds`).',
      )
    }
    if (!Array.isArray(props.editableColumnIds) || props.editableColumnIds.length === 0) {
      console.warn(
        '[TableGX] `editable` is true but `editableColumnIds` is empty — no column can enter edit mode. Provide the columns that may be edited.',
      )
    }
  }

  return <TableCore<TRow> {...(rest as TableGXTableProps<TRow>)} editable={editable} />
}

// The compound primitives, attached as static members so consumers can reach
// the low-level slots from the same entry point when they need custom chrome
// layout. Mirrors the standalone `Table` namespace established by the foundation.
TableGX.Provider = Table.Provider
TableGX.Container = Table.Container
TableGX.TabStrip = Table.TabStrip
TableGX.Panels = Table.Panels
TableGX.Body = Table.Body
TableGX.Toolbar = Table.Toolbar
TableGX.FilterBadges = Table.FilterBadges
TableGX.SortControl = Table.SortControl
TableGX.ColumnVisibility = Table.ColumnVisibility
TableGX.RecordCount = Table.RecordCount
