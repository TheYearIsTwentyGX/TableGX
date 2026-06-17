import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type TableToolbarProps = {
  children: ReactNode
  className?: string
}

/**
 * A plain right-aligned chrome row for composing controls (actions, sort, the
 * column picker, record count) outside the tab strip — e.g. above a plain
 * `TableBody`. Inside a tab strip, pass these controls to its `endContent`.
 */
export function TableToolbar({ children, className }: TableToolbarProps) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2', className)}>{children}</div>
  )
}
