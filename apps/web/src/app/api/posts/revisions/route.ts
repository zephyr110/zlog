import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import {
  getPostBySlug,
  getPostRevision,
  listPostRevisions,
  savePost,
} from "@zlog/database"

export const dynamic = "force-dynamic"

/** GET /api/posts/revisions?slug=xxx — 该文的历史摘要列表（新的在前）。 */
export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const slug = new URL(request.url).searchParams.get("slug")
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 })
  }
  return NextResponse.json({ revisions: await listPostRevisions(slug) })
}

/** POST /api/posts/revisions {id} — 把某一版恢复为当前内容。
 *  恢复本身也走 savePost：恢复前的状态同样会被快照，因此恢复
 *  是可回退的（误恢复 = 再恢复一次新版）。 */
export async function POST(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let id: number
  try {
    id = Number((await request.json())?.id)
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid revision id" }, { status: 400 })
  }

  const revision = await getPostRevision(id)
  if (!revision) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 })
  }

  // PostRevision 结构上就是 Post + id/createdAt；savePost 只读取 Post
  // 字段，快照元数据自然不会写回。
  const { slug } = revision
  await savePost(revision)

  return NextResponse.json({ post: await getPostBySlug(slug, true) })
}
