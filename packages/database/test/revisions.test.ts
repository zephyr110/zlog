// 版本历史：savePost 覆盖前快照、幂等跳过、改名迁移、容量修剪、
// 恢复往返、删除级联。跑真实 libsql file: 库——修剪 SQL、迁移
// UPDATE 这些行为本身就是要测的对象，mock 掉就没有意义了。
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { type Post } from "@zlog/core"

const dir = mkdtempSync(join(tmpdir(), "zlog-revisions-"))
process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`
delete process.env.TURSO_SYNC_URL

function mkPost(slug: string, overrides: Partial<Post> = {}): Post {
  return {
    slug,
    title: slug,
    date: "2026-01-01",
    tags: [],
    description: "",
    draft: false,
    pinnedAt: null,
    publishAt: null,
    content: "body",
    wordCount: 1,
    readingTime: 1,
    ...overrides,
  }
}

// Imported lazily so the env vars above are set before the client is
// created (getDb caches its client on first use).
const content = await import("../src/content")
const revisions = await import("../src/revisions")
const { REVISION_LIMIT } = revisions

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("savePost 快照", () => {
  it("内容变化时把被覆盖的旧行整份存进历史", async () => {
    const slug = "snap-basic"
    await content.savePost(mkPost(slug, { content: "v1" }))
    await content.savePost(mkPost(slug, { content: "v2" }))

    const list = await revisions.listPostRevisions(slug)
    expect(list).toHaveLength(1)
    expect(list[0].slug).toBe(slug)
    // 摘要不带 content——列表接口不该拖着 20 份全文。
    expect("content" in list[0]).toBe(false)

    const rev = await revisions.getPostRevision(list[0].id)
    expect(rev?.content).toBe("v1")
    expect(rev?.slug).toBe(slug)
    expect(typeof rev?.id).toBe("number")
    expect(typeof rev?.createdAt).toBe("string")
  })

  it("幂等重复保存（自动保存的常见形态）不产生快照", async () => {
    const slug = "snap-idempotent"
    const post = mkPost(slug, { content: "same" })
    await content.savePost(post)
    await content.savePost(post)
    await content.savePost(post)
    expect(await revisions.listPostRevisions(slug)).toHaveLength(0)
  })

  it("改名：旧历史迁到新 slug，且改名前的旧行也存一份", async () => {
    const oldSlug = "rename-old"
    const newSlug = "rename-new"
    await content.savePost(mkPost(oldSlug, { content: "before rename" }))
    await content.savePost(mkPost(oldSlug, { content: "mid" }))
    expect(await revisions.listPostRevisions(oldSlug)).toHaveLength(1)

    await content.savePost(
      mkPost(newSlug, { content: "after rename" }),
      oldSlug
    )

    expect(await content.getPostBySlug(oldSlug, true)).toBeNull()
    expect((await content.getPostBySlug(newSlug, true))?.content).toBe(
      "after rename"
    )

    const list = await revisions.listPostRevisions(newSlug)
    expect(list).toHaveLength(2)
    const contents = await Promise.all(
      list.map(async (s) => (await revisions.getPostRevision(s.id))!.content)
    )
    expect(contents.sort()).toEqual(["before rename", "mid"])
    expect(await revisions.listPostRevisions(oldSlug)).toHaveLength(0)
  })

  it("每篇只保留最近 REVISION_LIMIT 份", async () => {
    const slug = "snap-cap"
    const saves = REVISION_LIMIT + 5
    for (let i = 0; i < saves; i++) {
      await content.savePost(mkPost(slug, { content: `v${i}` }))
    }

    const list = await revisions.listPostRevisions(slug)
    expect(list).toHaveLength(REVISION_LIMIT)
    // 快照序列是 v0..v(last-1)；保留的是最近的 20 份。
    const newest = await revisions.getPostRevision(list[0].id)
    const oldest = await revisions.getPostRevision(list[list.length - 1].id)
    expect(newest?.content).toBe(`v${saves - 2}`)
    expect(oldest?.content).toBe(`v${saves - 1 - REVISION_LIMIT}`)
  })

  it("恢复是一次可回退的普通保存：被替换的新版同样进历史", async () => {
    const slug = "restore-roundtrip"
    await content.savePost(mkPost(slug, { content: "v1", title: "第一版" }))
    await content.savePost(mkPost(slug, { content: "v2", title: "第二版" }))

    const [snapshot] = await revisions.listPostRevisions(slug)
    const rev = await revisions.getPostRevision(snapshot.id)
    expect(rev).not.toBeNull()
    // PostRevision 结构上就是 Post + id/createdAt，直接回写即恢复。
    await content.savePost(rev!)

    const current = await content.getPostBySlug(slug, true)
    expect(current?.content).toBe("v1")
    expect(current?.title).toBe("第一版")

    // 恢复前的那一刻（v2）也在历史里 → 再恢复一次就能回来。
    const list = await revisions.listPostRevisions(slug)
    expect(list).toHaveLength(2)
    const latest = await revisions.getPostRevision(list[0].id)
    expect(latest?.content).toBe("v2")
  })

  it("删除文章时历史一并清除（新同名文章不会继承旧版本）", async () => {
    const slug = "delete-cascade"
    await content.savePost(mkPost(slug, { content: "a" }))
    await content.savePost(mkPost(slug, { content: "b" }))
    expect(await revisions.listPostRevisions(slug)).toHaveLength(1)

    expect(await content.deletePost(slug)).toBe(true)
    expect(await revisions.listPostRevisions(slug)).toHaveLength(0)
  })

  it("不存在的版本返回 null", async () => {
    expect(await revisions.getPostRevision(999_999)).toBeNull()
  })
})

describe("samePostContent", () => {
  it("逐字段比对内容（含 draft / publishAt）", () => {
    const base = mkPost("x")
    expect(revisions.samePostContent(base, mkPost("x"))).toBe(true)
    expect(
      revisions.samePostContent(base, mkPost("x", { content: "other" }))
    ).toBe(false)
    expect(revisions.samePostContent(base, mkPost("x", { draft: true }))).toBe(
      false
    )
    expect(
      revisions.samePostContent(
        base,
        mkPost("x", { publishAt: "2026-01-02 00:00:00" })
      )
    ).toBe(false)
    expect(revisions.samePostContent(base, mkPost("x", { tags: ["a"] }))).toBe(
      false
    )
  })

  it("标签按元素比对：['a b'] 与 ['a','b'] 不同", () => {
    expect(
      revisions.samePostContent(
        mkPost("x", { tags: ["a b"] }),
        mkPost("x", { tags: ["a", "b"] })
      )
    ).toBe(false)
  })

  it("pinnedAt 不参与：置顶变化不算内容变化", () => {
    expect(
      revisions.samePostContent(
        mkPost("x"),
        mkPost("x", { pinnedAt: "2026-01-01 00:00:00" })
      )
    ).toBe(true)
  })
})
