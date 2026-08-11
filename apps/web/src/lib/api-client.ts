const TOKEN_KEY = "blog-admin-token"
/** Cookie mirrored from localStorage so proxy can gate `/admin` routes. */
export const ADMIN_TOKEN_COOKIE = "blog-admin-token"
const COOKIE_NAME = ADMIN_TOKEN_COOKIE
/** Same-tab signal for analytics (and other listeners) when login/logout
 *  mutates localStorage — the browser `storage` event only fires cross-tab. */
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

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}

/** True when this browser holds an admin session (localStorage or cookie).
 *  Used to suppress analytics collection for the owner’s own browsing. */
export function hasAdminSession(): boolean {
  if (typeof window === "undefined") return false
  if (localStorage.getItem(TOKEN_KEY)) return true
  return document.cookie.split(";").some((part) => {
    const [name, ...rest] = part.trim().split("=")
    return name === COOKIE_NAME && rest.join("=").length > 0
  })
}

export function setToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token)
    // Keep a cookie in sync so proxy can validate admin routes.
    const maxAge = 60 * 60 * 24 * 7 // 7 days
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`
    notifyAdminSessionChange()
  }
}

export function clearToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY)
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`
    notifyAdminSessionChange()
  }
}

/** Redirect to the login page (only when a session has genuinely expired). */
function redirectToLogin(): void {
  clearToken()
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
 * - automatic Bearer token injection
 * - FormData-aware Content-Type handling
 * - 15s timeout (fetch has no default timeout)
 * - 401 → clear token + redirect to /admin/login, except for
 *   login/change-password routes where 401 is a business error
 */
export async function apiFetch(
  url: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { skipAuthRedirect = false, timeout = REQUEST_TIMEOUT, ...init } = options
  const token = getToken()
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
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
