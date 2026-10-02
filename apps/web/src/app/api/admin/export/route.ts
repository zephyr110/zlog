import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import { getAllPosts } from "@zlog/database"
import { getSiteConfig } from "@/lib/get-site-config"
import { buildExportEntries, exportFilename } from "@/lib/site-export"
import { buildZip } from "@/lib/zip"

export const dynamic = "force-dynamic"

/** 一键导出全站：全部文章（含草稿）→ 带 frontmatter 的 Markdown +
 *  manifest.json，打包成单个 zip。浏览器直接 GET 即触发下载
 *  （HttpOnly cookie 认证），无需客户端 JS。 */
export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [posts, config] = await Promise.all([getAllPosts(true), getSiteConfig()])
  const at = new Date()
  const zip = buildZip(buildExportEntries(posts, at, config.name), at)
  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${exportFilename(at)}"`,
      "Cache-Control": "no-store",
    },
  })
}
