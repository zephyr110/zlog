"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { apiFetch } from "@/lib/api-client"

type UnreadValue = {
  unread: number
  /** Force an immediate re-fetch — called by the comments page after
   *  mark-read/delete so the sidebar badge updates without waiting up
   *  to 60 s for the next poll. */
  refresh: () => void
}

const UnreadContext = createContext<UnreadValue>({
  unread: 0,
  refresh: () => {},
})

/**
 * Polls the unread comment count once and shares it with every consumer
 * (sidebar badge, dashboard stat card) through context — one interval,
 * one request per minute instead of one per component.
 *
 * The poll uses skipAuthRedirect: a background 401 (expired session)
 * must NOT hard-redirect the admin — that would yank a logged-in editor
 * out of an unsaved form. On 401 the count drops to 0 and polling stops
 * rather than showing a stale number forever.
 */
export function CommentUnreadProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState(0)
  // The external refresh() must reach the poll implementation living
  // inside the effect without re-creating listeners — a ref bridges
  // the two scopes.
  const refreshImplRef = useRef<() => void>(() => {})

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function refresh() {
      if (stopped) return
      try {
        const res = await apiFetch("/api/admin/comments?unread=1", {
          skipAuthRedirect: true,
        })
        if (!res.ok) {
          if (res.status === 401) {
            // Session dead — don't keep a stale count on screen.
            setUnread(0)
            stop()
          }
          return
        }
        const data = (await res.json()) as { unread: number }
        setUnread(data.unread)
      } catch {
        // Transient network failure — keep the old count, retry next tick.
      }
    }

    function stop() {
      stopped = true
      if (timer) clearInterval(timer)
      window.removeEventListener("visibilitychange", onVisible)
    }

    function onVisible() {
      if (document.visibilityState === "visible") void refresh()
    }

    refreshImplRef.current = () => void refresh()
    void refresh()
    timer = setInterval(() => void refresh(), 60_000)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      window.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  const refresh = useCallback(() => {
    refreshImplRef.current()
  }, [])

  return (
    <UnreadContext.Provider value={{ unread, refresh }}>
      {children}
    </UnreadContext.Provider>
  )
}

export function useCommentUnread(): UnreadValue {
  return useContext(UnreadContext)
}
