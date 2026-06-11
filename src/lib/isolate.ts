import type * as React from 'react'

/**
 * Swallows an event so it cannot leak into row selection, row expansion, or
 * inline-edit behaviors. Shared by `CellActions` and custom interactive cells.
 */
export function isolateCellEvent(event: React.SyntheticEvent): void {
  event.stopPropagation()
}

/**
 * Spread onto an interactive child rendered inside a custom cell so its
 * pointer events don't trigger the cell's click handler, row selection,
 * expansion, or inline edit.
 */
export const cellInteractionProps = {
  onClick: isolateCellEvent,
  onDoubleClick: isolateCellEvent,
  onMouseDown: isolateCellEvent,
  onPointerDown: isolateCellEvent,
} as const
