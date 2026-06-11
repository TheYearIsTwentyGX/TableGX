import { useEffect, useLayoutEffect } from 'react'

/**
 * `useLayoutEffect` on the client (pre-paint DOM reads/writes), `useEffect`
 * during SSR so React doesn't warn.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect
