import { cn } from '../lib/cn'
import { formatRecordCount, RECORD_COUNT_CLASS } from '../lib/recordCount'
import { useTableStore } from './store'

export type TableRecordCountProps = {
  className?: string
}

/**
 * The top-placed record count for the active tab, lifted from its panel into
 * the chrome. Renders nothing unless the active tab enables a top record count
 * and has a computed value.
 */
export function TableRecordCount({ className }: TableRecordCountProps) {
  const { recordCount, classNames } = useTableStore()
  if (!recordCount?.info) return null
  return (
    <span
      data-tgx-record-count=""
      className={cn(RECORD_COUNT_CLASS, classNames?.recordCount, className)}
    >
      {formatRecordCount(recordCount.info, recordCount.label)}
    </span>
  )
}
