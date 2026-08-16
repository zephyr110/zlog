"use client"

import { useSyncExternalStore } from "react"

const subscribeByQuery = new Map<string, (onChange: () => void) => () => void>()
const getSnapshotByQuery = new Map<string, () => boolean>()
const getServerSnapshot = () => false

function getSubscribe(query: string) {
  let subscribe = subscribeByQuery.get(query)
  if (!subscribe) {
    subscribe = (onChange: () => void) => {
      const mq = window.matchMedia(query)
      mq.addEventListener("change", onChange)
      return () => mq.removeEventListener("change", onChange)
    }
    subscribeByQuery.set(query, subscribe)
  }
  return subscribe
}

function getGetSnapshot(query: string) {
  let getSnapshot = getSnapshotByQuery.get(query)
  if (!getSnapshot) {
    getSnapshot = () => window.matchMedia(query).matches
    getSnapshotByQuery.set(query, getSnapshot)
  }
  return getSnapshot
}

/**
 * SSR-safe media-query hook (useSyncExternalStore): reads matchMedia at
 * event time, so the server snapshot can default to `false` without a
 * hydration mismatch. One implementation for every `(max-width: 767px)` /
 * `(hover: hover)` check — previously copy-pasted across the admin
 * sidebar, layout, calendar, and dot map.
 *
 * Subscribe / snapshot callbacks are cached per query so React does not
 * tear down and re-add the matchMedia listener on every re-render.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    getSubscribe(query),
    getGetSnapshot(query),
    getServerSnapshot
  )
}

/** True on devices with a fine pointer + hover (desktop tooltips vs tap). */
export function useCanHover(): boolean {
  return useMediaQuery("(hover: hover) and (pointer: fine)")
}
