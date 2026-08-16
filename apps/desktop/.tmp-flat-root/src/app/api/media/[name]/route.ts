import { NextRequest, NextResponse } from "next/server"
import { getMediaData, listMedia } from "@zlog/database"

/** Serves the Turso copy of a media file — disaster-recovery fallback for
 *  jsdelivr and the read path for exports. Public, like jsdelivr itself. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params

  // Plain filename only — no path segments, no hidden files.
  if (
    !name ||
    name.includes("/") ||
    name.includes("\\") ||
    name.startsWith(".")
  ) {
    return new NextResponse("Not found", { status: 404 })
  }

  const record = await getMediaData(name)
  if (!record) {
    return new NextResponse("Not found", { status: 404 })
  }

  return new NextResponse(Buffer.from(record.data), {
    headers: {
      "Content-Type": record.contentType,
      "Cache-Control": "public, max-age=86400",
    },
  })
}

/**
 * Static export requires dynamic segments to enumerate their params —
 * with output: export every media file is pre-rendered as a static file
 * under /api/media/<name>, which is exactly what this route exists for
 * (the read path for exports; jsdelivr remains the primary delivery).
 * New uploads appear after the next export run, matching the static
 * deployment model.
 */
export async function generateStaticParams(): Promise<{ name: string }[]> {
  // 桌面 standalone 构建（NEXT_DESKTOP=true）无数据库：不枚举静态路径，
  // 运行时按需读本地库（force-dynamic 不跳过 generateStaticParams，Task 12 CI 实测）
  if (process.env.NEXT_DESKTOP === "true") return []
  const media = await listMedia()
  return media.map((m) => ({ name: m.name }))
}
