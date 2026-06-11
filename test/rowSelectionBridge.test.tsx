import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRowSelectionBridge } from '../src/hooks/useRowSelectionBridge'

describe('useRowSelectionBridge', () => {
  it('uncontrolled: tracks internal state and emits flat ids', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useRowSelectionBridge(undefined, onChange))
    expect(result.current[0]).toEqual({})

    act(() => result.current[1]({ a: true, b: true }))
    expect(result.current[0]).toEqual({ a: true, b: true })
    expect(onChange).toHaveBeenCalledWith(['a', 'b'])

    act(() => result.current[1]((prev) => ({ ...prev, a: false })))
    expect(onChange).toHaveBeenLastCalledWith(['b'])
  })

  it('controlled: derives state from selectedRowIds and never mutates internally', () => {
    const onChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ ids }) => useRowSelectionBridge(ids, onChange),
      { initialProps: { ids: ['x'] } },
    )
    expect(result.current[0]).toEqual({ x: true })

    act(() => result.current[1]({ x: true, y: true }))
    // State unchanged until the parent passes new ids.
    expect(result.current[0]).toEqual({ x: true })
    expect(onChange).toHaveBeenCalledWith(['x', 'y'])

    rerender({ ids: ['x', 'y'] })
    expect(result.current[0]).toEqual({ x: true, y: true })
  })
})
