import { NextRequest, NextResponse } from "next/server"
import { runSync, getSyncStatus, isSyncConfigured } from "@zlog/database"
import { requireAuth } from "@/lib/api-auth"
import { validateDesktopKey } from "@/lib/desktop-auth"

export async function POST(request: NextRequest) {
  const user = await requireAuth(request)

  // Desktop shell 调用：本地环回地址 + 每次启动随机生成的密钥头。
  const keyOk = validateDesktopKey(
    request.headers.get("x-zlog-desktop-key"),
    process.env.ZLOG_DESKTOP_KEY
  )

  if (!user && !keyOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!isSyncConfigured()) {
    return NextResponse.json({ error: "sync not configured" }, { status: 400 })
  }
  try {
    await runSync()
    return NextResponse.json({ ok: true, status: getSyncStatus() })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        status: getSyncStatus(),
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
