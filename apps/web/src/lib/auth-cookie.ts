/**
 * Admin session cookie — set server-side so the JWT never reaches
 * JavaScript:
 *
 * - `HttpOnly`: `document.cookie` can't read it, so any XSS on the blog
 *   (e.g. a hostile uploaded SVG opened as a document) can't exfiltrate
 *   the admin token.
 * - `Secure`: never sent in cleartext, except from loopback origins
 *   (localhost / 127.0.0.1 / ::1), which browsers treat as trustworthy
 *   — that keeps local dev and the desktop app (http://127.0.0.1)
 *   working.
 * - `SameSite=Lax`: the cookie is withheld from cross-site POSTs, which
 *   blocks the classic form-based CSRF against the admin APIs.
 *
 * This module is deliberately client-safe (no node: imports): the web
 * client imports ADMIN_SESSION_EVENT machinery from api-client, which
 * imports this file too.
 */

export const ADMIN_TOKEN_COOKIE = "blog-admin-token"

/** JWT lifetime — keep the cookie max-age in lockstep (auth JWT_EXPIRATION
 *  is 7d). */
export const ADMIN_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

export interface AdminCookieOptions {
  httpOnly: true
  secure: boolean
  sameSite: "lax"
  path: string
  maxAge: number
}

export function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  )
}

/**
 * Cookie flags for the admin session. `Secure` is only safe to set when
 * the connection is https or the host is loopback — Chromium, Firefox
 * and Safari all accept Secure cookies from loopback origins, so the
 * desktop app and local dev keep working; any other plain-http host gets
 * an insecure cookie exactly like before.
 */
export function adminCookieOptions(
  protocol: string,
  hostname: string
): AdminCookieOptions {
  return {
    httpOnly: true,
    secure: protocol === "https:" || isLoopbackHost(hostname),
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  }
}
