import { HEADER_HEIGHT_PX, ROW_HEIGHT_PX } from '../constants'
import { cn } from '../lib/cn'
import { Skeleton } from '../ui/skeleton'

type TableSkeletonProps = {
  /** Effective widths of the visible columns (pinned first). */
  widths: number[]
  rowCount?: number
  className?: string
}

const BODY_WIDTH_CYCLE = ['75%', '50%', '85%', '40%', '65%']

/** Loading skeleton mirroring the grid layout at the real column widths (spec §17). */
export function TableSkeleton({ widths, rowCount = 8, className }: TableSkeletonProps) {
  const cols = widths.length > 0 ? widths : [200, 200, 200]
  return (
    <div className={cn('min-w-full', className)} data-tgx-skeleton="" aria-busy="true">
      <div
        className="flex items-center border-b border-border bg-(--tgx-header-bg)"
        style={{ height: HEADER_HEIGHT_PX }}
      >
        {cols.map((w, i) => (
          <div key={i} className="flex shrink-0 items-center px-3" style={{ width: w }}>
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
      {Array.from({ length: rowCount }, (_, r) => (
        <div
          key={r}
          className="flex items-center border-b border-border"
          style={{ height: ROW_HEIGHT_PX }}
        >
          {cols.map((w, c) => (
            <div key={c} className="flex shrink-0 items-center px-3" style={{ width: w }}>
              <Skeleton
                className="h-3.5"
                style={{ width: BODY_WIDTH_CYCLE[(r + c) % BODY_WIDTH_CYCLE.length] }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
