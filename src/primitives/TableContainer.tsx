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
  const { classNames } = useTableStore()
  return (
    <div
      data-tgx-tabbed-table=""
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
