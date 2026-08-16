import { NextResponse } from "next/server"

/**
 * Shared 429 response for every lockout gate (login, recovery reset).
 * The wording deliberately matches the other auth errors (generic, no
 * state disclosure); Retry-After is the machine-readable detail.
 */
export function lockedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many failed attempts. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  )
}
