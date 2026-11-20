import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import { isDemoMode } from "@/lib/demo-mode"
import {
  generateRecoveryKey,
  hashPassword,
  normalizeRecoveryKey,
} from "@zlog/auth"
import { getUserByUsername, setUserRecoveryHash } from "@zlog/database"

/** 当前登录用户是否已配置恢复密钥。 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    // 演示环境拒绝签发密钥（见 POST），这里直接报已配置，避免引导走向死路
    if (isDemoMode()) {
      return NextResponse.json({ configured: true })
    }
    const record = await getUserByUsername(user.username)
    if (!record) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    return NextResponse.json({ configured: !!record.recoveryHash })
  } catch (error) {
    console.error("Recovery key status error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * Generates a new one-time recovery key for the signed-in user.
 * The plaintext key is returned exactly once in this response; only its
 * bcrypt hash is persisted. Any previously-issued recovery key is
 * replaced immediately.
 */
export async function POST(request: NextRequest) {
  try {
    // 演示环境：拦截 recovery key 签发（否则可与 reset 组合绕过改密拦截）
    if (isDemoMode()) {
      return NextResponse.json(
        { error: "Password changes are disabled in the demo environment" },
        { status: 403 }
      )
    }

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
