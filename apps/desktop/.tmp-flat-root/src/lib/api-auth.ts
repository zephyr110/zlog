import { NextRequest } from "next/server"
import { verifyToken } from "@zlog/auth"
import { type AuthUser } from "@zlog/auth"

export async function requireAuth(
  request: NextRequest
): Promise<AuthUser | null> {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null

  const token = authHeader.slice(7)
  return verifyToken(token)
}
