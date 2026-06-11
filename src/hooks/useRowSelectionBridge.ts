import type { OnChangeFn, RowSelectionState } from '@tanstack/react-table'
import { useCallback, useMemo, useRef, useState } from 'react'

function toRecord(ids: string[]): RowSelectionState {
  const record: RowSelectionState = {}
  for (const id of ids) record[id] = true
  return record
}

function toIds(state: RowSelectionState): string[] {
  return Object.keys(state).filter((k) => state[k])
}

/**
 * Bridges TanStack's keyed RowSelectionState to the flat `selectedRowIds`
 * public API (spec §11). Controlled when `selectedRowIds` is provided,
 * uncontrolled (with change callback) otherwise.
 */
export function useRowSelectionBridge(
  selectedRowIds: string[] | undefined,
  onSelectedRowIdsChange: ((ids: string[]) => void) | undefined,
): [RowSelectionState, OnChangeFn<RowSelectionState>] {
  const isControlled = selectedRowIds !== undefined
  const [internal, setInternal] = useState<RowSelectionState>({})

  const state = useMemo(
    () => (isControlled ? toRecord(selectedRowIds) : internal),
    [isControlled, selectedRowIds, internal],
  )

  const stateRef = useRef(state)
  stateRef.current = state
  const onChangeRef = useRef(onSelectedRowIdsChange)
  onChangeRef.current = onSelectedRowIdsChange

  const onChange = useCallback<OnChangeFn<RowSelectionState>>(
    (updater) => {
      const next = typeof updater === 'function' ? updater(stateRef.current) : updater
      if (!isControlled) setInternal(next)
      onChangeRef.current?.(toIds(next))
    },
    [isControlled],
  )

  return [state, onChange]
}
