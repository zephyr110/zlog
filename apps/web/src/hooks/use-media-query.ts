"use client"

import { useSyncExternalStore } from "react"

function subscribe(query: string) {
  return (onChange: () => void) => {
    const mq = window.matchMedia(query)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }
}

/**
 * SSR-safe media-query hook (useSyncExternalStore): reads matchMedia at
 * event time, so the server snapshot can default to `false` without a
 * hydration mismatch. One implementation for every `(max-width: 767px)` /
 * `(hover: hover)` check — previously copy-pasted across the admin
 * sidebar, layout, calendar, and dot map.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia(query).matches,
    () => false
  )
}

/** True on devices with a fine pointer + hover (desktop tooltips vs tap). */
export function useCanHover(): boolean {
  return useMediaQuery("(hover: hover) and (pointer: fine)")
}
