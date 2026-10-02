import { type Post } from "@zlog/database"
import { type ZipEntry } from "./zip"

/** 导出文件名：zlog-export-YYYY-MM-DD.zip（UTC 日期）。 */
export function exportFilename(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `zlog-export-${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(
    at.getUTCDate()
  )}.zip`
}

/** zip 条目路径安全化：slug 白名单（字母数字 . _ -），其余字符折叠为
 *  "-"；再去掉首尾的点/横线——保证条目名扁平、永远留在 posts/ 下，
 *  且不会生成 Windows 不接受的尾点文件名。 */
export function safeExportSlug(slug: string): string {
  const cleaned = slug
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/[.-]+$/, "")
  return cleaned || "post"
}

/** 单篇 → 带 YAML frontmatter 的 Markdown。字符串统一用 JSON 转义
 *  ——JSON 字符串是合法的 YAML 双引号标量，因此输出可被 Astro /
 *  Hugo / Eleventy 等直接消费，且无需手写引号转义。
 *  可空字段（updated/cover/pinnedAt/publishAt）省略即 null 语义。 */
export function serializePostMarkdown(post: Post): string {
  const lines = ["---"]
  const quoted = (key: string, value: string) =>
    lines.push(`${key}: ${JSON.stringify(value)}`)
  quoted("title", post.title)
  quoted("slug", post.slug)
  quoted("date", post.date)
  if (post.updated) quoted("updated", post.updated)
  lines.push(`tags: [${post.tags.map((tag) => JSON.stringify(tag)).join(", ")}]`)
  quoted("description", post.description)
  if (post.cover) quoted("cover", post.cover)
  lines.push(`draft: ${post.draft}`)
  if (post.pinnedAt) quoted("pinnedAt", post.pinnedAt)
  if (post.publishAt) quoted("publishAt", post.publishAt)
  lines.push("---", "")
  const body = post.content.endsWith("\n") ? post.content : `${post.content}\n`
  return `${lines.join("\n")}\n${body}`
}

export type SiteExportManifest = {
  generator: "zlog"
  version: number
  exportedAt: string
  siteName: string
  counts: { total: number; published: number; drafts: number }
  files: string[]
}

/** 全部文章（含草稿）→ zip 条目：manifest.json + posts/<slug>.md。 */
export function buildExportEntries(
  posts: Post[],
  at: Date,
  siteName: string
): ZipEntry[] {
  // Two legitimate slugs can collapse to one export path ("-foo" and
  // "foo" both sanitize to "foo") — suffix the later one instead of
  // emitting duplicate zip entries, which unzip tools silently resolve
  // to a single file (dropping a post from the export).
  const usedPaths = new Set<string>()
  const files = posts.map((post) => {
    const base = `posts/${safeExportSlug(post.slug)}`
    let path = `${base}.md`
    for (let n = 2; usedPaths.has(path); n++) path = `${base}-${n}.md`
    usedPaths.add(path)
    return { path, text: serializePostMarkdown(post) }
  })
  const drafts = posts.filter((post) => post.draft).length
  const manifest: SiteExportManifest = {
    generator: "zlog",
    version: 1,
    exportedAt: at.toISOString(),
    siteName,
    counts: { total: posts.length, published: posts.length - drafts, drafts },
    files: files.map((file) => file.path),
  }
  return [
    { path: "manifest.json", text: `${JSON.stringify(manifest, null, 2)}\n` },
    ...files,
  ]
}
