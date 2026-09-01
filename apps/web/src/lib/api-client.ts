/**
 * Client-side admin session helpers.
 *
 * The session JWT itself lives ONLY in an HttpOnly cookie set by
 * /api/auth/login — JavaScript never sees it (see lib/auth-cookie.ts).
 * What the client tracks instead:
 *  - a non-sensitive localStorage flag mirroring "a session exists",
 *    used for analytics suppression and the footer's admin link;
 *  - an event dispatched on login/logout so same-tab listeners (and the
 *    cross-tab `storage` event) can re-read the flag.
 */

/** localStorage flag — "1" while a session exists. Never holds the token.
 *  Exporting it lets client components (site-analytics bootstrap) read
 *  the same key instead of duplicating the literal. */
export const ADMIN_SESSION_FLAG = "zlog-admin-session"

/** Same-tab signal for analytics (and other listeners) when login/logout
 *  mutates the session flag — the browser `storage` event only fires
 *  cross-tab. */
export const ADMIN_SESSION_EVENT = "zlog:admin-session"
const REQUEST_TIMEOUT = 15_000

// Routes whose 401 responses are business errors (wrong password),
// not expired/invalid sessions — never redirect on these.
const AUTH_EXEMPT_PATHS = [
  "/api/auth/login",
  "/api/auth/change-password",
  "/api/auth/reset", // wrong recovery key is a business error, not a dead session
]

function notifyAdminSessionChange(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(ADMIN_SESSION_EVENT))
}

/** True when this browser holds an admin session (localStorage flag).
 *  Used to suppress analytics collection for the owner's own browsing. */
export function hasAdminSession(): boolean {
  if (typeof window === "undefined") return false
  return localStorage.getItem(ADMIN_SESSION_FLAG) === "1"
}

/**
 * Called after a successful login. The server already set the HttpOnly
 * session cookie; this mirrors a localStorage flag (for client-side
 * session detection) and notifies same-tab listeners.
 */
export function setToken(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(ADMIN_SESSION_FLAG, "1")
    notifyAdminSessionChange()
  }
}

/** Clear the session: drop the local flag immediately (client state must
 *  not depend on a network round-trip), then ask the server to delete
 *  the HttpOnly cookie. Best effort — the request is fire-and-forget. */
export async function clearToken(): Promise<void> {
  if (typeof window !== "undefined") {
    localStorage.removeItem(ADMIN_SESSION_FLAG)
    notifyAdminSessionChange()
  }
  try {
    await fetch("/api/auth/logout", { method: "POST" })
  } catch {
    // best effort — local state is already cleared
  }
}

/** Redirect to the login page (only when a session has genuinely expired). */
function redirectToLogin(): void {
  void clearToken()
  if (
    typeof window !== "undefined" &&
    !window.location.pathname.startsWith("/admin/login")
  ) {
    window.location.href = "/admin/login"
  }
}

interface ApiFetchOptions extends RequestInit {
  /** Skip the 401 → login redirect for this request. */
  skipAuthRedirect?: boolean
  /** Override the default 15s timeout (e.g. image uploads, which include
   *  compression + a GitHub push and can take 10-60s). */
  timeout?: number
}

/**
 * fetch wrapper with:
 * - automatic cookie-based auth (the HttpOnly session cookie is sent by
 *   the browser on same-origin requests — no Authorization header needed)
 * - FormData-aware Content-Type handling
 * - 15s timeout (fetch has no default timeout)
 * - 401 → clear session + redirect to /admin/login, except for
 *   login/change-password routes where 401 is a business error
 */
export async function apiFetch(
  url: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { skipAuthRedirect = false, timeout = REQUEST_TIMEOUT, ...init } = options
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(init.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json"
  }

  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers,
      // AbortSignal.any merges a caller-provided signal with the timeout.
      signal:
        init.signal && typeof AbortSignal.any === "function"
          ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)])
          : init.signal ?? AbortSignal.timeout(timeout),
    })
  } catch (error) {
    // Network failure or timeout — rethrow so callers can show
    // their network-error toast.
    throw error
  }

  if (
    res.status === 401 &&
    !skipAuthRedirect &&
    !AUTH_EXEMPT_PATHS.some((path) => url.includes(path))
  ) {
    redirectToLogin()
  }

  return res
}
