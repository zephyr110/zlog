import { describe, it, expect, afterAll } from "vitest"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createClient } from "@libsql/client"

const script = join(__dirname, "../scripts/export-public-snapshot.mjs")
const tmp = mkdtempSync(join(tmpdir(), "zlog-snapshot-test-"))
const source = join(tmp, "source.sqlite")
const out = join(tmp, "out.sqlite")

const SECRETS = [
  "USERHASHSECRET0001",
  "RECOVERYSECRET0002",
  "author@example.com",
  "IPHASHSECRET0003",
  "IPHASHSECRET0004",
  "DRAFT SECRET BODY",
  "HIDDEN SECRET BODY",
  "FUTURE SECRET BODY",
]

afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe("export-public-snapshot.mjs", () => {
  it("只保留公开内容，并清掉隐私字段与草稿正文", async () => {
    const db = createClient({ url: `file:${source}` })
    await db.batch(
      [
        "CREATE TABLE users (id INTEGER PRIMARY KEY, password_hash TEXT, recovery_hash TEXT)",
        "CREATE TABLE auth_lockout (key TEXT)",
        "CREATE TABLE comment_rate_limit (key TEXT)",
        "CREATE TABLE post_revisions (id INTEGER PRIMARY KEY)",
        "CREATE TABLE analytics_monthly (id INTEGER PRIMARY KEY)",
        "CREATE TABLE media (id INTEGER PRIMARY KEY, data BLOB)",
        "CREATE TABLE posts (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, date TEXT, draft INTEGER, visible INTEGER, publish_at TEXT, content TEXT, cover TEXT)",
        "CREATE TABLE comments (id INTEGER PRIMARY KEY, post_slug TEXT, author_name TEXT, author_email TEXT, content TEXT, ip_hash TEXT)",
        "CREATE TABLE projects (id INTEGER PRIMARY KEY, visible INTEGER)",
        "CREATE TABLE site_settings (id INTEGER PRIMARY KEY, name TEXT)",
        [
          "INSERT INTO users (password_hash, recovery_hash) VALUES (?, ?), (?, ?)",
          ["USERHASHSECRET0001", "RECOVERYSECRET0002", "x", "y"],
        ],
        "INSERT INTO auth_lockout (key) VALUES ('10.0.0.1')",
        "INSERT INTO comment_rate_limit (key) VALUES ('10.0.0.1')",
        "INSERT INTO post_revisions (id) VALUES (1)",
        "INSERT INTO analytics_monthly (id) VALUES (1)",
        "INSERT INTO media (data) VALUES (x'DEADBEEF')",
        "INSERT INTO posts (slug, title, date, draft, visible, publish_at, content, cover) VALUES ('public-post', 'Public', '2026-01-01', 0, 1, NULL, 'PUBLIC BODY', '')",
        "INSERT INTO posts (slug, title, date, draft, visible, publish_at, content, cover) VALUES ('past-scheduled', 'Past', '2026-01-02', 0, 1, strftime('%Y-%m-%d %H:%M:%S','now','-1 hour'), 'PUBLIC BODY 2', '')",
        "INSERT INTO posts (slug, title, date, draft, visible, publish_at, content, cover) VALUES ('future-scheduled', 'Future', '2026-01-03', 0, 1, strftime('%Y-%m-%d %H:%M:%S','now','+1 day'), 'FUTURE SECRET BODY', '')",
        "INSERT INTO posts (slug, title, date, draft, visible, publish_at, content, cover) VALUES ('draft-post', 'Draft', '2026-01-04', 1, 1, NULL, 'DRAFT SECRET BODY', '')",
        "INSERT INTO posts (slug, title, date, draft, visible, publish_at, content, cover) VALUES ('hidden-post', 'Hidden', '2026-01-05', 0, 0, NULL, 'HIDDEN SECRET BODY', '')",
        "INSERT INTO comments (post_slug, author_name, author_email, content, ip_hash) VALUES ('public-post', 'Alice', 'author@example.com', 'PUBLIC COMMENT', 'IPHASHSECRET0003')",
        "INSERT INTO comments (post_slug, author_name, author_email, content, ip_hash) VALUES ('draft-post', 'Bob', 'draft@example.com', 'DRAFT COMMENT', 'IPHASHSECRET0004')",
        "INSERT INTO projects (visible) VALUES (1), (0)",
        "INSERT INTO site_settings (id, name) VALUES (1, 'Zlog')",
      ],
      "write"
    )
    db.close()

    execFileSync(process.execPath, [script, "--source", source, "--out", out], {
      stdio: "pipe",
      timeout: 60_000,
    })

    expect(existsSync(`${out}-wal`)).toBe(false)
    expect(existsSync(`${out}-shm`)).toBe(false)

    const check = createClient({ url: `file:${out}` })
    try {
      const count = async (sql: string) =>
        Number((await check.execute(sql)).rows[0]?.n ?? 0)

      expect(await count("SELECT COUNT(*) AS n FROM posts")).toBe(2)
      expect(await count("SELECT COUNT(*) AS n FROM posts WHERE slug IN ('future-scheduled','draft-post','hidden-post')")).toBe(0)
      expect(await count("SELECT COUNT(*) AS n FROM users")).toBe(0)
      expect(await count("SELECT COUNT(*) AS n FROM media")).toBe(0)
      expect(await count("SELECT COUNT(*) AS n FROM comments")).toBe(1)
      expect(await count("SELECT COUNT(*) AS n FROM comments WHERE post_slug = 'draft-post'")).toBe(0)
      expect(await count("SELECT COUNT(*) AS n FROM comments WHERE author_email <> '' OR ip_hash <> ''")).toBe(0)
      expect(await count("SELECT COUNT(*) AS n FROM projects")).toBe(1)
      expect(await count("SELECT COUNT(*) AS n FROM site_settings")).toBe(1)
    } finally {
      check.close()
    }

    const bytes = readFileSync(out)
    for (const secret of SECRETS) {
      expect(bytes.includes(Buffer.from(secret, "utf8")), `${secret} leaked`).toBe(false)
    }
  }, 60_000)
})
