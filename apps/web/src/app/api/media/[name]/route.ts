import { NextRequest, NextResponse } from "next/server"
import { getMediaData } from "@zlog/database"

/** Serves the Turso copy of a media file — disaster-recovery fallback for
 *  jsdelivr. Public, like jsdelivr itself.
 *
 *  静态导出站不提供此路由：toggle-force-static.mjs 在 export 构建时
 *  把 api/ 下的动态段路由整体 stash（Next 16 不导出带动态段的 route
 *  handler——本文件曾带 generateStaticParams 仍报 missing，实证），
 *  导出站的图片走 jsdelivr 主路径。 */
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

  const isSvg = record.contentType === "image/svg+xml"
  return new NextResponse(Buffer.from(record.data), {
    headers: {
      "Content-Type": record.contentType,
      "Cache-Control": "public, max-age=86400",
      // SVG can carry scripts that run when opened as a top-level
      // document (not when embedded via <img>). Sandbox it: opaque
      // origin, no scripts, no top-level navigation — a hostile SVG
      // can't touch the site even if one slips past the upload check.
      ...(isSvg ? { "Content-Security-Policy": "sandbox" } : {}),
      "X-Content-Type-Options": "nosniff",
    },
  })
}
