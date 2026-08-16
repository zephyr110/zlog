import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import { markCommentRead } from "@zlog/database"

export async function generateStaticParams(): Promise<{ id: string }[]> {
  return [{ id: "0" }]
}

// Static build (output: export) needs a GET — answered 405; the
// runtime (Vercel) handles POST.
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}

/** Mark a single comment as read (clears it from the unread badge). */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await context.params
  const commentId = Number(id)
  if (!Number.isInteger(commentId)) {
    return NextResponse.json({ error: "Invalid comment id" }, { status: 400 })
  }
  const ok = await markCommentRead(commentId)
  return NextResponse.json({ ok })
}
