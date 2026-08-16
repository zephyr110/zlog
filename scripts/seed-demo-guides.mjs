/** 一次性脚本：把中英双语部署指南系列插入演示环境 Turso 库。
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

// 本地时区日期（toISOString 是 UTC，UTC+8 凌晨会差一天）
function localDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const cjk = /[一-龥぀-ゟ゠-ヿ가-힯]/g
function stats(content) {
  const cjkCount = (content.match(cjk) || []).length
  const nonCjk = content.replace(cjk, " ").split(/\s+/).filter(Boolean).length
  const wordCount = cjkCount + nonCjk
  return { wordCount, readingTime: Math.max(1, Math.ceil(wordCount / 200)) }
}

// 文章日期：脚本运行当天（可被 TURSO_DEMO_DATE 覆盖）——重跑刷新时
// 文章不会钉死在首次入库的日期
const today =
  process.env.TURSO_DEMO_DATE ?? localDate()

// 与正式站一致的系列文章（docs/guides/series/）
const guides = [
  {
    slug: "zlog-deployment-guide",
    title: "Zlog 部署指南（一）：三种方式怎么选",
    date: today,
    tags: JSON.stringify(["Zlog", "指南", "部署"]),
    description:
      "本地使用、Turso 云端同步、一键发布 Vercel——三种方式怎么选？一张对比表 + 决策树，5 分钟上手。",
    file: "docs/guides/series/zlog-deployment-guide.md",
  },
  {
    slug: "zlog-deployment-guide-sync",
    title: "Zlog 部署指南（二）：Turso 云端同步",
    date: today,
    tags: JSON.stringify(["Zlog", "指南", "Turso"]),
    description:
      "把博客数据同步到 Turso 云端库：注册建库、桌面端填入连接串、验证同步，数据安全与多端一致。",
    file: "docs/guides/series/zlog-deployment-guide-sync.md",
  },
  {
    slug: "zlog-deployment-guide-vercel",
    title: "Zlog 部署指南（三）：一键部署到 Vercel，发布公网",
    date: today,
    tags: JSON.stringify(["Zlog", "指南", "Vercel"]),
    description:
      "注册 Vercel、生成 Token、桌面端一键部署——无需 Git 和命令行，2-5 分钟把博客发布成公开网站。",
    file: "docs/guides/series/zlog-deployment-guide-vercel.md",
  },
  {
    slug: "zlog-deployment-guide-en",
    title: "Zlog Deployment Guide (1/3): Which Mode Should You Choose?",
    date: today,
    tags: JSON.stringify(["Zlog", "guide", "deploy"]),
    description:
      "Local use, Turso cloud sync, or one-click Vercel publish? A comparison table and a decision tree to get started in 5 minutes.",
    file: "docs/guides/series/zlog-deployment-guide.en.md",
  },
  {
    slug: "zlog-deployment-guide-sync-en",
    title: "Zlog Deployment Guide (2/3): Turso Cloud Sync",
    date: today,
    tags: JSON.stringify(["Zlog", "guide", "Turso"]),
    description:
      "Sync your blog to a Turso cloud database: sign up, create a DB, paste the connection URL into the desktop app, and verify.",
    file: "docs/guides/series/zlog-deployment-guide-sync.en.md",
  },
  {
    slug: "zlog-deployment-guide-vercel-en",
    title: "Zlog Deployment Guide (3/3): One-Click Deploy to Vercel",
    date: today,
    tags: JSON.stringify(["Zlog", "guide", "Vercel"]),
    description:
      "Sign up for Vercel, create a token, and one-click deploy from the desktop app — no Git or terminal, public in 2–5 minutes.",
    file: "docs/guides/series/zlog-deployment-guide-vercel.en.md",
  },
]

const sql = `INSERT INTO posts (slug, title, date, updated, tags, description, cover, draft, pinned_at, content, word_count, reading_time)
VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?, ?)`
const del = "DELETE FROM posts WHERE slug = ?"

// posts 表由应用 ensureTable 惰性创建——全新库（未启动过 app）直接
// INSERT 会报 no such table，这里先行建表
const CREATE_POSTS = `CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  date TEXT NOT NULL,
  updated TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  cover TEXT,
  draft INTEGER NOT NULL DEFAULT 0,
  pinned_at TEXT,
  content TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  reading_time INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`

const requests = [{ type: "execute", stmt: { sql: CREATE_POSTS, args: [] } }]
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
