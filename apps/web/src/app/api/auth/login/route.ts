import { NextRequest, NextResponse } from "next/server"
import { createToken, attemptLogin } from "@zlog/auth"
import { lockedResponse } from "@/lib/auth-lockout"
import { ADMIN_TOKEN_COOKIE, adminCookieOptions } from "@/lib/auth-cookie"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    // Truthiness alone would let non-string values through (e.g. a numeric
    // password), which then throws inside bcrypt — reject them here so the
    // attempt still counts and throttles like any other failure.
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      )
    }

    const attempt = await attemptLogin(username, password)

    if (attempt.status === "locked") {
      return lockedResponse(attempt.retryAfterSeconds)
    }

    if (attempt.status === "invalid") {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      )
    }

    const token = await createToken(attempt.user)

    // The JWT rides ONLY in an HttpOnly + Secure + SameSite=Lax cookie —
    // it is never returned to JavaScript, so XSS can't read it and
    // cross-site POSTs can't carry it (CSRF). API auth reads the cookie
    // via requireAuth; proxy.ts reads it to gate /admin routes.
    const res = NextResponse.json({ user: attempt.user })
    res.cookies.set(
      ADMIN_TOKEN_COOKIE,
      token,
      adminCookieOptions(request.nextUrl.protocol, request.nextUrl.hostname)
    )
    return res
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
