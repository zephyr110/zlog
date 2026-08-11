"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next"
import { GoogleAnalytics } from "@next/third-parties/google"
import {
  ADMIN_SESSION_EVENT,
  ADMIN_TOKEN_COOKIE,
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

/** Server snapshot must be static — root layout cannot call cookies() or
 *  GitHub Pages `next export` fails on `/_not-found`. Admin detection is
 *  client-only (+ the inline ga-disable bootstrap below). */
function getServerAdminSnapshot() {
  return false
}

/**
 * Site-wide pageview collectors. Drops owner noise at send time:
 * - admin session (token in localStorage / cookie) — covers public pages
 *   while logged in, not just /admin/*
 * - any /admin path (login page included)
 *
 * Historical aggregates cannot be scrubbed; this only affects new events.
 */
export function SiteAnalytics({ gaId }: { gaId?: string }) {
  // Same-tab login/logout: ADMIN_SESSION_EVENT from setToken/clearToken.
  // Cross-tab: native `storage`.
  const isAdmin = useSyncExternalStore(
    subscribeAdminSession,
    hasAdminSession,
    getServerAdminSnapshot
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

  // Runs before GoogleAnalytics’s script: cookie-only check so an admin
  // hard-refresh does not send a first hit while React hydrates.
  const gaDisableBootstrap =
    gaId &&
    `(function(){try{if(/(?:^|;\\s*)${ADMIN_TOKEN_COOKIE}=/.test(document.cookie)){window[${JSON.stringify(`ga-disable-${gaId}`)}]=true}}catch(e){}})();`

  return (
    <>
      {gaDisableBootstrap ? (
        <script dangerouslySetInnerHTML={{ __html: gaDisableBootstrap }} />
      ) : null}
      <Analytics beforeSend={beforeSend} />
      {gaId && allowGa ? <GoogleAnalytics gaId={gaId} /> : null}
    </>
  )
}
