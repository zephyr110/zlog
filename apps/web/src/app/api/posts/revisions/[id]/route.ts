import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import { getPostRevision } from "@zlog/database"

export const dynamic = "force-dynamic"

/** GET /api/posts/revisions/[id] — 单个历史版本的完整内容（预览用）。 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: raw } = await params
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid revision id" }, { status: 400 })
  }

  const revision = await getPostRevision(id)
  if (!revision) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 })
  }
  return NextResponse.json({ revision })
}
