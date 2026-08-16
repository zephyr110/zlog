import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth } from "@/lib/api-auth"
import { verifyLogin, hashPassword, recordFailedAttempt } from "@zlog/auth"
import { setUserPassword, clearLoginFailures } from "@zlog/database"

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
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

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rawBody = await request.json()
    const parseResult = changePasswordSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      )
    }

    const { currentPassword, newPassword } = parseResult.data

    const verifiedUser = await verifyLogin(user.username, currentPassword)
    if (!verifiedUser) {
      // A wrong current password is still a credential guess — feed the
      // shared lockout counter and eat the delay so this endpoint can't
      // double as an unthrottled password oracle for session holders.
      await recordFailedAttempt()
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      )
    }

    const newHash = await hashPassword(newPassword)

    // Persist to the database. updated_at bumps automatically, which
    // invalidates all previously-issued JWTs (password version changed).
    const updated = await setUserPassword(user.username, newHash)
    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update password" },
        { status: 500 }
      )
    }

    // A successful password change is proof of legitimate admin access —
    // clear any failure streak (also unblocks a login lockout that a
    // lockout-era password change would otherwise strand the admin in).
    await clearLoginFailures()

    return NextResponse.json({ success: true, requireRelogin: true })
  } catch (error) {
    console.error("Change password error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
