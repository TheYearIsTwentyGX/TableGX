import type { Cell } from '@tanstack/react-table'
import { flexRender } from '@tanstack/react-table'
import { CheckIcon, PencilIcon } from 'lucide-react'
import * as React from 'react'
import { INDENT_STEP_PX, ROW_HEIGHT_PX } from '../constants'
import { cn } from '../lib/cn'
import { Checkbox } from '../ui/checkbox'
import type { TableColumnMeta, TableRowData } from '../types'
import { CellActions } from './CellActions'
import { CellEditor, type EditNavigation } from './CellEditors'
import { ExpandToggle } from './ExpandToggle'

export type BodyCellProps<TRow extends TableRowData> = {
  cell: Cell<TRow, unknown>
  width: number
  /** True when this exact cell is in edit mode. */
  isEditing: boolean
  /** Column is whitelisted + meta.editable and the table is editable. */
  canEdit: boolean
  singleClickEdit?: boolean
  /** Disables editors while a save is pending or the table is submitting. */
  editorsDisabled: boolean
  isSubmitting?: boolean
  initialEditValue: string
  onBeginEdit: (cell: Cell<TRow, unknown>) => void
  /** Stable cell-keyed callback so memoized cells skip re-renders. */
  onCommitEdit: (cell: Cell<TRow, unknown>, value: string | number | boolean, nav?: EditNavigation) => void
  onCancelEdit: () => void
  onDirectBooleanSave: (cell: Cell<TRow, unknown>, value: boolean) => void
  /** This column hosts the nested-row disclosure control. */
  showExpandControl: boolean
  /**
   * Memo invalidation only. Cells that render TanStack state read off the Row
   * (selection checkbox, expand chevron) receive it here because the Row
   * instance identity does not change with that state.
   */
  stateKey?: unknown
  className?: string
}

/** Single body cell renderer implementing the spec §6 decision order. */
function BodyCellInner<TRow extends TableRowData>({
  cell,
  width,
  isEditing,
  canEdit,
  singleClickEdit,
  editorsDisabled,
  isSubmitting,
  initialEditValue,
  onBeginEdit,
  onCommitEdit,
  onCancelEdit,
  onDirectBooleanSave,
  showExpandControl,
  className,
}: BodyCellProps<TRow>) {
  const meta = (cell.column.columnDef.meta ?? {}) as TableColumnMeta
  const row = cell.row
  const isBoolean = meta.inputType === 'boolean'
  const actions = meta.actions

  const interactiveBoolean = canEdit && isBoolean && singleClickEdit && !editorsDisabled

  const beginEdit = () => {
    if (!canEdit || isEditing || editorsDisabled) return
    onBeginEdit(cell)
  }

  const clickProps: React.HTMLAttributes<HTMLDivElement> = {}
  if (canEdit && !isEditing) {
    if (singleClickEdit) {
      // Boolean cells become directly interactive instead of entering edit mode.
      if (!isBoolean) clickProps.onClick = beginEdit
    } else {
      clickProps.onDoubleClick = beginEdit
    }
  }

  let content: React.ReactNode
  if (isEditing) {
    content = (
      <CellEditor
        inputType={meta.inputType ?? 'text'}
        selectOptions={meta.selectOptions}
        initialValue={initialEditValue}
        disabled={editorsDisabled}
        onCommit={(value, nav) => onCommitEdit(cell, value, nav)}
        onCancel={onCancelEdit}
      />
    )
  } else if (isBoolean) {
    const checked = Boolean(row.original[cell.column.id] ?? cell.getValue())
    content = (
      <span className="flex min-w-0 items-center gap-2 text-sm">
        {interactiveBoolean ? (
          <Checkbox
            checked={checked}
            disabled={isSubmitting}
            aria-label={checked ? 'Yes' : 'No'}
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={(next) => onDirectBooleanSave(cell, next === true)}
          />
        ) : (
          // Static replica of a disabled Checkbox. Boolean cells are by far
          // the most common interactive-looking cell in wide tables; mounting
          // a real Radix checkbox per cell dominates scroll commit cost.
          <span
            role="checkbox"
            aria-checked={checked}
            aria-disabled="true"
            aria-label={checked ? 'Yes' : 'No'}
            className={cn(
              'flex size-4 shrink-0 cursor-not-allowed items-center justify-center rounded-[4px] border border-input opacity-50',
              checked && 'border-primary bg-primary text-primary-foreground',
            )}
          >
            {checked && <CheckIcon className="size-3.5" />}
          </span>
        )}
        <span className="truncate text-muted-foreground">{checked ? 'Yes' : 'No'}</span>
      </span>
    )
  } else {
    content = (
      <span className="min-w-0 flex-1 truncate">
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </span>
    )
  }

  return (
    <div
      data-tgx-cell={cell.column.id}
      className={cn(
        'group/cell flex items-center gap-1 overflow-hidden px-3 text-sm',
        canEdit && !isEditing && 'cursor-pointer',
        className,
      )}
      style={{ width, height: ROW_HEIGHT_PX }}
      {...clickProps}
    >
      {showExpandControl && (
        <span
          className="flex shrink-0 items-center"
          style={{ paddingLeft: row.depth * INDENT_STEP_PX }}
        >
          {row.getCanExpand() ? (
            <ExpandToggle expanded={row.getIsExpanded()} onToggle={() => row.toggleExpanded()} />
          ) : (
            <span className="inline-block size-6 shrink-0" aria-hidden />
          )}
        </span>
      )}
      {content}
      {canEdit && !isEditing && !isBoolean && (
        <PencilIcon
          aria-hidden
          className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/cell:opacity-60"
        />
      )}
      {actions && actions.length > 0 && (
        <CellActions actions={actions} row={row.original} isSubmitting={isSubmitting} />
      )}
    </div>
  )
}

export const BodyCell = React.memo(BodyCellInner) as typeof BodyCellInner
