import { Loader2Icon } from 'lucide-react'
import * as React from 'react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import type { CellAction, CellActionButton, TableRowData } from '../types'

type CellActionsProps<TRow extends TableRowData> = {
  actions: CellAction<TableRowData>[]
  row: TRow
  isSubmitting?: boolean
}

/** Swallows every event that could leak into row/cell behaviors (spec §20.2). */
function isolate(e: React.SyntheticEvent) {
  e.stopPropagation()
}

function ActionButton<TRow extends TableRowData>({
  action,
  row,
  isSubmitting,
}: {
  action: CellActionButton<TableRowData>
  row: TRow
  isSubmitting?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const disabled = busy || isSubmitting === true || action.isDisabled?.(row) === true

  const run = async (event: React.MouseEvent) => {
    const result = action.onClick(row, event)
    if (result instanceof Promise) {
      setBusy(true)
      try {
        await result
      } finally {
        setBusy(false)
      }
    }
  }

  const handleClick = (event: React.MouseEvent) => {
    isolate(event)
    if (disabled) return
    if (action.confirm) {
      setConfirmOpen(true)
      return
    }
    void run(event)
  }

  const iconOnly = !action.label
  let button = (
    <Button
      variant={action.variant ?? 'ghost'}
      size={iconOnly ? 'icon-sm' : 'sm'}
      disabled={disabled}
      aria-label={action.ariaLabel ?? action.label}
      aria-busy={busy || undefined}
      data-tgx-cell-action={action.id}
      onClick={handleClick}
      onDoubleClick={isolate}
      onMouseDown={isolate}
      onPointerDown={isolate}
    >
      {busy ? <Loader2Icon className="animate-spin" /> : action.icon}
      {action.label}
    </Button>
  )

  if (action.tooltip) {
    button = (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{action.tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (!action.confirm) return button

  return (
    <>
      {button}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onClick={isolate} onDoubleClick={isolate}>
          <AlertDialogHeader>
            <AlertDialogTitle>{action.confirm.title}</AlertDialogTitle>
            {action.confirm.description && (
              <AlertDialogDescription>{action.confirm.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={action.variant === 'destructive' ? 'destructive' : 'default'}
              onClick={(event) => {
                isolate(event)
                setConfirmOpen(false)
                void run(event)
              }}
            >
              {action.confirm.confirmLabel ?? 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * Declarative cell action buttons (spec §20). Right-aligned after the value,
 * click-isolated from selection/expansion/edit, with hidden/disabled/confirm/
 * busy states.
 */
export function CellActions<TRow extends TableRowData>({
  actions,
  row,
  isSubmitting,
}: CellActionsProps<TRow>) {
  const visible = actions.filter((action) => action.isHidden?.(row) !== true)
  if (visible.length === 0) return null
  return (
    <span
      className="ml-auto flex shrink-0 items-center gap-1 pl-1"
      onClick={isolate}
      onDoubleClick={isolate}
    >
      {visible.map((action) =>
        'render' in action ? (
          <span
            key={action.id}
            data-tgx-cell-action={action.id}
            onClick={isolate}
            onDoubleClick={isolate}
            onMouseDown={isolate}
            onPointerDown={isolate}
          >
            {action.render(row)}
          </span>
        ) : (
          <ActionButton key={action.id} action={action} row={row} isSubmitting={isSubmitting} />
        ),
      )}
    </span>
  )
}
