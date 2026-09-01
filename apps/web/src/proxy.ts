import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifyToken } from "@zlog/auth"
import { ADMIN_TOKEN_COOKIE } from "@/lib/auth-cookie"
import {
  isAdminPath,
  isAppRouterRscRequest,
  shouldRedirectAdminToLogin,
} from "@/lib/admin-route-guard"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only protect admin routes; public routes and login are always accessible.
  if (!isAdminPath(pathname)) {
    return NextResponse.next()
  }

  if (pathname === "/admin/login") {
    return NextResponse.next()
  }

  // Server-set cookie (login route) — the cookies API already decodes
  // the value, so no manual decodeURIComponent (that was for the old
  // client-set cookie). verifyToken fails closed on a bad token.
  const token = request.cookies.get(ADMIN_TOKEN_COOKIE)?.value
  const user = token ? await verifyToken(token) : null

  // Document navigations without a session go to login. RSC client
  // navigations must not 302 — Next then renders the global error page
  // ("This page couldn’t load / Reload to try again, or go back").
  // The admin layout already redirects via localStorage when needed.
  if (
    shouldRedirectAdminToLogin({
      pathname,
      hasUser: !!user,
      isRsc: isAppRouterRscRequest(request.headers),
    })
  ) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/admin/login"
    loginUrl.search = ""
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
