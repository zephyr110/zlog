import { NextRequest, NextResponse } from "next/server"
import { type PublicComment } from "@/lib/comment-shared"
import { getRepliesToComments } from "@zlog/database"

// Guest reply notifications: the visitor's browser stores the ids of the
// comments IT posted (localStorage) and asks this route whether any of
// them got replies. Read-only and comment-shaped data is public anyway
// (GET /api/comments already serves it per post), so no auth — but the
// id list is strictly validated and capped to keep the IN() clause and
// the response bounded.

const MAX_IDS = 50

/** Digits only — ids are AUTOINCREMENT integers. Rejecting junk here
 *  keeps the placeholder list in the DB layer purely numeric. */
const ID_RE = /^\d{1,15}$/

export async function GET(request: NextRequest) {
  const raw = new URL(request.url).searchParams.get("ids") ?? ""
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (parts.length === 0 || parts.length > MAX_IDS) {
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 })
  }
  if (!parts.every((p) => ID_RE.test(p))) {
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 })
  }

  const replies = await getRepliesToComments(parts.map(Number))
  const publicReplies: PublicComment[] = replies.map((c) => ({
    id: c.id,
    postSlug: c.postSlug,
    authorName: c.authorName,
    content: c.content,
    parentId: c.parentId,
    createdAt: c.createdAt,
  }))
  return NextResponse.json({ replies: publicReplies })
}
