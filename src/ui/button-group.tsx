import * as React from 'react'
import { cn } from '../lib/cn'

export function ButtonGroup({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      data-slot="button-group"
      role="group"
      className={cn(
        'flex w-fit items-stretch [&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none',
        className,
      )}
      {...props}
    />
  )
}
