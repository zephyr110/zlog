/** 一次性脚本：把中英双语部署指南作为文章插入演示环境 Turso 库。
 *  用法：TURSO_DEMO_TOKEN=<token> node scripts/seed-demo-guides.mjs
 *  幂等：已存在的 slug 会先删除再插入（重复运行安全）。 */
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const DB_URL =
  process.env.TURSO_DEMO_URL ??
  "https://zlog-test-zephyr110.aws-ap-northeast-1.turso.io"
const TOKEN = process.env.TURSO_DEMO_TOKEN ?? ""

const cjk = /[一-龥぀-ゟ゠-ヿ가-힯]/g
function stats(content) {
  const cjkCount = (content.match(cjk) || []).length
  const nonCjk = content.replace(cjk, " ").split(/\s+/).filter(Boolean).length
  const wordCount = cjkCount + nonCjk
  return { wordCount, readingTime: Math.max(1, Math.ceil(wordCount / 200)) }
}

const guides = [
  {
    slug: "zlog-deployment-guide",
    title: "Zlog 部署指南：本地、Turso 同步与一键发布 Vercel",
    date: "2026-08-16",
    tags: JSON.stringify(["指南", "部署", "Zlog"]),
    description: "从本地使用到云端同步、再到一键部署 Vercel 发布公网，三种场景的完整图文步骤。",
    file: "docs/guides/zlog-deployment-guide.md",
  },
  {
    slug: "zlog-deployment-guide-en",
    title: "Zlog Deployment Guide: Local, Turso Sync & One-Click Vercel",
    date: "2026-08-16",
    tags: JSON.stringify(["guide", "deploy", "Zlog"]),
    description: "Full walkthrough for three scenarios: local use, Turso cloud sync, and one-click public deployment to Vercel.",
    file: "docs/guides/zlog-deployment-guide.en.md",
  },
]

const sql = `INSERT INTO posts (slug, title, date, updated, tags, description, cover, draft, pinned_at, content, word_count, reading_time)
VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?, ?)`
const del = "DELETE FROM posts WHERE slug = ?"

const requests = []
for (const g of guides) {
  const content = readFileSync(join(ROOT, g.file), "utf8")
  const { wordCount, readingTime } = stats(content)
  requests.push(
    { type: "execute", stmt: { sql: del, args: [{ type: "text", value: g.slug }] } },
    {
      type: "execute",
      stmt: {
        sql,
        args: [
          { type: "text", value: g.slug },
          { type: "text", value: g.title },
          { type: "text", value: g.date },
          { type: "text", value: g.date },
          { type: "text", value: g.tags },
          { type: "text", value: g.description },
          { type: "text", value: content },
          { type: "text", value: String(wordCount) },
          { type: "text", value: String(readingTime) },
        ],
      },
    }
  )
  console.log(`queued ${g.slug} (${wordCount} words, ${readingTime} min)`)
}

const res = await fetch(`${DB_URL}/v2/pipeline`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ requests }),
})
const body = await res.json()
const errors = (body.results ?? []).filter((r) => r.type !== "ok")
if (errors.length) {
  console.error("FAILED:", JSON.stringify(errors[0]))
  process.exit(1)
}
console.log("seeded", guides.length, "guide posts ✓")
