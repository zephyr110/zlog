#!/usr/bin/env node
/**
 * 生成 Web 端公开内容快照：apps/web/fallback/public-snapshot.sqlite。
 *
 * 远端库读被挡住（配额/封禁）时，build.mjs 用它预渲染公开页，站点照常可读；
 * 配额恢复后 ISR 会自动追平，快照只在构建期使用。
 *
 * 来源默认是桌面端已同步的本地副本。导出会脱敏并重建文件（VACUUM）：
 * 只留已发布文章、公开评论（清空邮箱与 IP 哈希）、可见项目与站点设置；
 * 清空用户、草稿/隐藏/定时文章、修订、分析与媒体 BLOB。
 * 产物会进公开仓库，导出后务必确认不包含个人数据。
 *
 * 用法：
 *   node packages/database/scripts/export-public-snapshot.mjs [--source <db>] [--out <file>]
 */
import { createClient } from "@libsql/client"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "..", "..", "..")
const DEFAULT_OUT = join(repoRoot, "apps", "web", "fallback", "public-snapshot.sqlite")

/** 与 packages/database/src/content.ts 的 PUBLISHED_SQL 保持一致。
 *  publish_at 由编辑器写成 UTC "YYYY-MM-DD HH:MM:SS"，可直接与 datetime('now') 比较。 */
const PUBLIC_POSTS =
  "visible = 1 AND draft = 0 AND (publish_at IS NULL OR publish_at <= datetime('now'))"

function defaultSource() {
  const appData =
    process.platform === "darwin"
      ? join(homedir(), "Library", "Application Support", "@zlog", "desktop")
      : process.platform === "win32"
        ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "@zlog", "desktop")
        : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "@zlog", "desktop")
  return join(appData, "zlog.db")
}

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const source = resolve(argValue("--source") ?? defaultSource())
const out = resolve(argValue("--out") ?? DEFAULT_OUT)
if (!existsSync(source)) {
  console.error(`[snapshot] source database not found: ${source}`)
  console.error("[snapshot] pass --source <path> (桌面端副本通常位于上方默认路径)")
  process.exit(1)
}

const work = join(tmpdir(), `zlog-public-snapshot-${process.pid}.sqlite`)
cleanupSidecars(work)
rmSync(work, { force: true })

function cleanupSidecars(path) {
  rmSync(`${path}-wal`, { force: true })
  rmSync(`${path}-shm`, { force: true })
}

/** 高熵隐私值：导出后逐字节确认不在成品里（只报类型，不回显值）。 */
async function collectSecrets(db) {
  const queries = [
    ["SELECT password_hash AS v FROM users", "用户密码哈希"],
    ["SELECT recovery_hash AS v FROM users", "恢复密钥哈希"],
    ["SELECT author_email AS v FROM comments WHERE author_email <> ''", "评论邮箱"],
    ["SELECT ip_hash AS v FROM comments WHERE ip_hash <> ''", "评论 IP 哈希"],
  ]
  const secrets = []
  for (const [sql, label] of queries) {
    const { rows } = await db.execute(sql)
    for (const row of rows) {
      const value = typeof row.v === "string" ? row.v : ""
      if (value.length >= 8) secrets.push({ label, value })
    }
  }
  return secrets
}

const sourceDb = createClient({ url: `file:${source}` })
let secrets
try {
  secrets = await collectSecrets(sourceDb)
  // VACUUM INTO 产出 WAL 一致视图，不必要求桌面端先退出
  await sourceDb.execute(`VACUUM INTO '${work.replaceAll("'", "''")}'`)
} finally {
  sourceDb.close()
}

const db = createClient({ url: `file:${work}` })
try {
  await db.execute("PRAGMA secure_delete = ON")
  const statements = [
    ["DELETE FROM users", "users"],
    ["DELETE FROM auth_lockout", "auth_lockout"],
    ["DELETE FROM comment_rate_limit", "comment_rate_limit"],
    ["DELETE FROM post_revisions", "post_revisions"],
    ["DELETE FROM analytics_monthly", "analytics_monthly"],
    // 公开内容不引用 /api/media（封面均为外链；唯一引用在草稿里，随草稿删除）
    ["DELETE FROM media", "media"],
    [`DELETE FROM posts WHERE NOT (${PUBLIC_POSTS})`, "non-public posts"],
    ["DELETE FROM comments WHERE post_slug NOT IN (SELECT slug FROM posts)", "orphan comments"],
    ["UPDATE comments SET author_email = '', ip_hash = ''", "comment privacy fields"],
    ["DELETE FROM projects WHERE visible = 0", "hidden projects"],
  ]
  for (const [sql, label] of statements) await db.execute(sql)

  const checks = [
    ["SELECT COUNT(*) AS n FROM users", "users"],
    ["SELECT COUNT(*) AS n FROM media", "media"],
    [`SELECT COUNT(*) AS n FROM posts WHERE NOT (${PUBLIC_POSTS})`, "non-public posts"],
    ["SELECT COUNT(*) AS n FROM comments WHERE post_slug NOT IN (SELECT slug FROM posts)", "orphan comments"],
    ["SELECT COUNT(*) AS n FROM comments WHERE author_email <> '' OR ip_hash <> ''", "comment privacy fields"],
    ["SELECT COUNT(*) AS n FROM projects WHERE visible = 0", "hidden projects"],
  ]
  for (const [sql, label] of checks) {
    const { rows } = await db.execute(sql)
    const n = Number(rows[0]?.n ?? 0)
    if (n !== 0) throw new Error(`snapshot sanitization failed: ${label} = ${n}`)
  }
  // 重建文件，释放删除后残留在空闲页里的哈希/草稿正文
  await db.execute("PRAGMA journal_mode = DELETE")
  await db.execute("VACUUM")
} finally {
  db.close()
}

cleanupSidecars(work)
const bytes = readFileSync(work)
for (const secret of secrets) {
  if (bytes.includes(Buffer.from(secret.value, "utf8"))) {
    throw new Error(`snapshot still contains ${secret.label}`)
  }
}

mkdirSync(dirname(out), { recursive: true })
cleanupSidecars(out)
const partial = `${out}.tmp`
rmSync(partial, { force: true })
copyFileSync(work, partial)
renameSync(partial, out)
rmSync(work, { force: true })

const check = createClient({ url: `file:${out}` })
try {
  const counts = {}
  for (const table of ["posts", "comments", "projects", "site_settings"]) {
    const { rows } = await check.execute(`SELECT COUNT(*) AS n FROM ${table}`)
    counts[table] = Number(rows[0]?.n ?? 0)
  }
  const size = statSync(out).size
  console.log(`[snapshot] wrote ${out} (${(size / 1024).toFixed(0)} KiB)`)
  console.log(
    `[snapshot] posts=${counts.posts} comments=${counts.comments} projects=${counts.projects} settings=${counts.site_settings}`
  )
} finally {
  check.close()
}
