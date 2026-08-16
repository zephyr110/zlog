import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import {
  generateRecoveryKey,
  hashPassword,
  normalizeRecoveryKey,
} from "@zlog/auth"
import { setUserRecoveryHash } from "@zlog/database"

/**
 * Generates a new one-time recovery key for the signed-in user.
 * The plaintext key is returned exactly once in this response; only its
 * bcrypt hash is persisted. Any previously-issued recovery key is
 * replaced immediately.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const recoveryKey = generateRecoveryKey()
    const recoveryHash = await hashPassword(normalizeRecoveryKey(recoveryKey))
    const stored = await setUserRecoveryHash(user.username, recoveryHash)
    if (!stored) {
      return NextResponse.json(
        { error: "Failed to generate recovery key" },
        { status: 500 }
      )
    }

    return NextResponse.json({ recoveryKey })
  } catch (error) {
    console.error("Generate recovery key error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
