import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { useTableStore } from './store'

export type TableContainerProps = {
  children: ReactNode
  className?: string
}

/**
 * The outer folder-table frame (border, rounded corners, card background).
 * Holds the tab strip + panels; matches the chrome previously emitted by the
 * shared tab shell so styling and `data-tgx-tabbed-table` hooks are unchanged.
 */
export function TableContainer({ children, className }: TableContainerProps) {
  const { classNames, tabs } = useTableStore()
  // Any-tab editability: the app passes only permission-visible tabs, so the
  // presence of an editable tab means this user can edit *something* here —
  // even if the currently active tab happens to be read-only (e.g. a "View"
  // tab). Deliberately coarser than TableCore's own per-column marker (see
  // `isEffectivelyEditable` there): tabs declare editability intent, no
  // column-visibility analysis needed.
  const hasEditableTab = tabs.some((tab) => tab.editable === true)
  return (
    <div
      data-tgx-tabbed-table=""
      data-tgx-editable={hasEditableTab ? '' : undefined}
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card',
        classNames?.container,
        className,
      )}
    >
      {children}
    </div>
  )
}
