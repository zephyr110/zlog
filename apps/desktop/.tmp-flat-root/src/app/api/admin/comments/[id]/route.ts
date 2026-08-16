import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import { deleteComment } from "@zlog/database"

export async function generateStaticParams(): Promise<{ id: string }[]> {
  return [{ id: "0" }]
}

/** GET is not supported on this route — exported only so the static
 *  build (output: export) can materialize the dynamic segment; the
 *  runtime (Vercel) answers POST/DELETE as usual. */
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}

/** Hard-delete a comment (spam cleanup). */
export async function DELETE(
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
  // removed/removedUnread let the inbox page adjust its counts exactly
  // even when a root's replies live on other pages of the paginated
  // list (the delete cascades server-side).
  const { removed, removedUnread } = await deleteComment(commentId)
  return NextResponse.json({ ok: removed > 0, removed, removedUnread })
}
