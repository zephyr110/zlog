/**
 * Decide whether /admin gate should 302 to login.
 *
 * App Router client navigations send an RSC request. A 302 on that
 * request makes Next show the global error page ("This page couldn’t
 * load / Reload to try again, or go back") instead of the login form.
 * The admin layout already sends unauthenticated users to /admin/login.
 */
export function shouldRedirectAdminToLogin(opts: {
  pathname: string
  hasUser: boolean
  isRsc: boolean
}): boolean {
  const { pathname, hasUser, isRsc } = opts
  if (!isAdminPath(pathname) || pathname === "/admin/login") {
    return false
  }
  if (hasUser) return false
  if (isRsc) return false
  return true
}

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/")
}

export function isAppRouterRscRequest(headers: {
  get(name: string): string | null
}): boolean {
  return headers.get("RSC") !== null || headers.get("Next-Router-State-Tree") !== null
}
