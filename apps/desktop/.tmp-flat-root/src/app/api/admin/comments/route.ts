import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import {
  listAdminComments,
  countUnreadComments,
} from "@zlog/database"

/** Admin comment inbox.
 *  ?unread=1 → lightweight { unread } for sidebar badge polling.
 *  Otherwise → paginated list (unread first) + unreadCount. */
export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  if (searchParams.get("unread") === "1") {
    return NextResponse.json({ unread: await countUnreadComments() })
  }

  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("pageSize") ?? 20) || 20)
  )
  const result = await listAdminComments({ page, pageSize })
  return NextResponse.json(result)
}
