"use client"

import { useCallback, useRef } from "react"

/**
 * Guards async loads against stale responses: each `begin()` returns a
 * sequence token; only the latest token should write React state.
 *
 *   const stale = useStaleRequest()
 *   const seq = stale.begin()
 *   const data = await fetch(...)
 *   if (!stale.isCurrent(seq)) return
 *   setState(data)
 */
export function useStaleRequest() {
  const seqRef = useRef(0)

  const begin = useCallback(() => ++seqRef.current, [])

  const isCurrent = useCallback((seq: number) => seq === seqRef.current, [])

  return { begin, isCurrent }
}
