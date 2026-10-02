import { NextRequest, NextResponse } from "next/server"
import { countUnreadComments } from "@zlog/database"
import { validateDesktopKey } from "@/lib/desktop-auth"

export const dynamic = "force-dynamic"

/**
 * Desktop shell only (x-zlog-desktop-key): the unread comment count the
 * Electron main process polls for native notifications. Same number as the
 * `?unread=1` branch of /api/admin/comments, but authenticated by the
 * per-install desktop key — the main process holds no admin session.
 */
export async function GET(request: NextRequest) {
  if (
    !validateDesktopKey(
      request.headers.get("x-zlog-desktop-key"),
      process.env.ZLOG_DESKTOP_KEY
    )
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  return NextResponse.json(
    { unread: await countUnreadComments() },
    { headers: { "Cache-Control": "no-store" } }
  )
}
