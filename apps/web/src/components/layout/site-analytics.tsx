"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next"
import { GoogleAnalytics } from "@next/third-parties/google"
import {
  ADMIN_SESSION_EVENT,
  hasAdminSession,
} from "@/lib/api-client"
import { isPublicTrafficPath } from "@/lib/analytics-paths"

function subscribeAdminSession(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(ADMIN_SESSION_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(ADMIN_SESSION_EVENT, onStoreChange)
  }
}

/**
 * Site-wide pageview collectors. Drops owner noise at send time:
 * - admin session (token in localStorage / cookie) — covers public pages
 *   while logged in, not just /admin/*
 * - any /admin path (login page included)
 *
 * Historical aggregates cannot be scrubbed; this only affects new events.
 */
export function SiteAnalytics({
  gaId,
  /** From the request cookie on the server so real visitors still get GA
   *  in the initial HTML (no post-hydration delay). */
  initialAllowGa = true,
}: {
  gaId?: string
  initialAllowGa?: boolean
}) {
  // Same-tab login/logout: ADMIN_SESSION_EVENT from setToken/clearToken.
  // Cross-tab: native `storage`. Server snapshot uses the cookie seed.
  const isAdmin = useSyncExternalStore(
    subscribeAdminSession,
    hasAdminSession,
    () => !initialAllowGa
  )
  const allowGa = !isAdmin

  useEffect(() => {
    if (!gaId) return
    // Official opt-out: must stay in sync while gtag is present.
    ;(window as Window & Record<string, boolean>)[`ga-disable-${gaId}`] =
      isAdmin
  }, [gaId, isAdmin])

  const beforeSend = useCallback((event: BeforeSendEvent) => {
    if (hasAdminSession()) return null
    try {
      const path = new URL(event.url).pathname
      if (!isPublicTrafficPath(path)) return null
    } catch {
      /* malformed URL — still send rather than drop visitor data */
    }
    return event
  }, [])

  return (
    <>
      <Analytics beforeSend={beforeSend} />
      {gaId && allowGa ? <GoogleAnalytics gaId={gaId} /> : null}
    </>
  )
}
