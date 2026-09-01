import { NextRequest } from "next/server"
import { verifyToken } from "@zlog/auth"
import { type AuthUser } from "@zlog/auth"
import { ADMIN_TOKEN_COOKIE } from "@/lib/auth-cookie"

export async function requireAuth(
  request: NextRequest
): Promise<AuthUser | null> {
  // Primary: the HttpOnly session cookie set by /api/auth/login (the
  // browser sends it automatically on same-origin requests).
  const cookieToken = request.cookies.get(ADMIN_TOKEN_COOKIE)?.value
  if (cookieToken) {
    const user = await verifyToken(cookieToken)
    if (user) return user
  }

  // Fallback: Bearer header for non-browser clients (scripts, curl).
  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    return verifyToken(authHeader.slice(7))
  }

  return null
}
