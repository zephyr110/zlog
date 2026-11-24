import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createClient, type Client } from "@libsql/client"

/** 提交进仓库的快照会被 build.mjs 当作预渲染数据源，且属于公开内容。 */
const snapshot = join(__dirname, "../../..", "apps/web/fallback/public-snapshot.sqlite")
const tmp = mkdtempSync(join(tmpdir(), "zlog-public-snapshot-"))
const copy = join(tmp, "public-snapshot.sqlite")
let db: Client

beforeAll(() => {
  copyFileSync(snapshot, copy)
  db = createClient({ url: `file:${copy}` })
})

afterAll(() => {
  db?.close()
  rmSync(tmp, { recursive: true, force: true })
})

async function count(sql: string): Promise<number> {
  const { rows } = await db.execute(sql)
  return Number(rows[0]?.n ?? 0)
}

describe("apps/web/fallback/public-snapshot.sqlite", () => {
  it("文件存在且没有未合并的 WAL", () => {
    expect(existsSync(snapshot)).toBe(true)
    expect(existsSync(`${snapshot}-wal`)).toBe(false)
    expect(existsSync(`${snapshot}-shm`)).toBe(false)
  })

  it("结构完整、journal 模式为 delete", async () => {
    const integrity = await db.execute("PRAGMA integrity_check")
    expect(Object.values(integrity.rows[0])[0]).toBe("ok")
    const mode = await db.execute("PRAGMA journal_mode")
    expect(String(Object.values(mode.rows[0])[0]).toLowerCase()).toBe("delete")
  })

  it("不含用户、媒体、非公开文章与评论隐私字段", async () => {
    expect(await count("SELECT COUNT(*) AS n FROM users")).toBe(0)
    expect(await count("SELECT COUNT(*) AS n FROM media")).toBe(0)
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM posts WHERE visible <> 1 OR draft <> 0 OR (publish_at IS NOT NULL AND publish_at > datetime('now'))"
      )
    ).toBe(0)
    expect(
      await count("SELECT COUNT(*) AS n FROM comments WHERE post_slug NOT IN (SELECT slug FROM posts)")
    ).toBe(0)
    expect(
      await count("SELECT COUNT(*) AS n FROM comments WHERE author_email <> '' OR ip_hash <> ''")
    ).toBe(0)
    expect(await count("SELECT COUNT(*) AS n FROM projects WHERE visible = 0")).toBe(0)
  })

  it("保留可渲染的公开内容", async () => {
    expect(await count("SELECT COUNT(*) AS n FROM posts")).toBeGreaterThan(0)
    expect(await count("SELECT COUNT(*) AS n FROM posts WHERE length(content) > 0")).toBeGreaterThan(0)
    expect(await count("SELECT COUNT(*) AS n FROM site_settings")).toBe(1)
    // 媒体已整体剔除：公开内容不能引用 /api/media，否则封面会 404
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM posts WHERE cover LIKE '%/api/media/%' OR content LIKE '%/api/media/%'"
      )
    ).toBe(0)
  })
})
