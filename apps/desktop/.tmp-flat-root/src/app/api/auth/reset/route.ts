import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { attemptRecoveryKey, hashPassword } from "@zlog/auth"
import { setUserPassword } from "@zlog/database"
import { lockedResponse } from "@/lib/auth-lockout"

const resetPasswordSchema = z.object({
  username: z.string().min(1, "Username is required"),
  recoveryKey: z.string().min(1, "Recovery key is required"),
  // bcrypt truncates at 72 bytes — cap new passwords so the stored hash
  // covers the whole password.
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .refine(
      (s) => Buffer.byteLength(s, "utf8") <= 72,
      "New password is too long (max 72 bytes)"
    ),
})

/**
 * Password reset via the one-time recovery key (no session required).
 * The key is compared against its bcrypt hash; a missing user, missing
 * key, or wrong key all return the same generic 401 to avoid user
 * enumeration. On success the password is replaced — updated_at bumps,
 * so any previously-issued JWTs are invalidated.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json()
    const parseResult = resetPasswordSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      )
    }

    const { username, recoveryKey, newPassword } = parseResult.data

    // Same lockout as login, with one difference: a CORRECT key is still
    // honored while locked — this is the admin's escape hatch when the
    // login lock is armed (and success clears the lockout).
    const attempt = await attemptRecoveryKey(username, recoveryKey)

    if (attempt.status === "locked") {
      return lockedResponse(attempt.retryAfterSeconds)
    }

    if (attempt.status === "invalid") {
      return NextResponse.json(
        { error: "Invalid recovery key" },
        { status: 401 }
      )
    }

    const newHash = await hashPassword(newPassword)
    const updated = await setUserPassword(username, newHash)
    if (!updated) {
      return NextResponse.json(
        { error: "Failed to reset password" },
        { status: 500 }
      )
    }

    // Recovery key intentionally stays valid (single-admin blog) — the
    // user can rotate it any time from Settings once signed back in.
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Password reset error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
