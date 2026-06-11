import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Like useState, but persists to localStorage under `key` when a key is given.
 * SSR-safe: the stored value is applied on the client only; reads are lazy.
 */
export function useLocalStorageState<T>(
  key: string | undefined,
  initialValue: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (!key || typeof window === 'undefined') return initialValue
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? initialValue : (JSON.parse(raw) as T)
    } catch {
      return initialValue
    }
  })

  const keyRef = useRef(key)
  keyRef.current = key

  useEffect(() => {
    if (!keyRef.current || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(keyRef.current, JSON.stringify(value))
    } catch {
      // Storage may be unavailable (private mode, quota); persistence is best-effort.
    }
  }, [value])

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => (typeof next === 'function' ? (next as (p: T) => T)(prev) : next))
  }, [])

  return [value, set]
}
