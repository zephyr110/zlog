import { NextRequest, NextResponse } from "next/server"
import { ADMIN_TOKEN_COOKIE, adminCookieOptions } from "@/lib/auth-cookie"

/** Drop the HttpOnly session cookie. Client JS can't delete an HttpOnly
 *  cookie itself, so logout must go through the server. */
export async function POST(request: NextRequest) {
  const res = NextResponse.json({ success: true })
  res.cookies.set(ADMIN_TOKEN_COOKIE, "", {
    ...adminCookieOptions(request.nextUrl.protocol, request.nextUrl.hostname),
    maxAge: 0,
  })
  return res
}
