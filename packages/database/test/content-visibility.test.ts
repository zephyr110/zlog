// Public-visibility rules for posts: drafts are hidden, and so are
// published posts whose publish_at is still in the future (scheduled
// publishing). Runs against a real libsql file: database so the SQL
// clause itself — not a mock — is what's under test.
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { type Post } from "@zlog/core"

const dir = mkdtempSync(join(tmpdir(), "zlog-visibility-"))
process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`
delete process.env.TURSO_SYNC_URL

const utc = (offsetMs: number) =>
  new Date(Date.now() + offsetMs).toISOString().slice(0, 19).replace("T", " ")
const PAST = utc(-24 * 60 * 60 * 1000)
const FUTURE = utc(24 * 60 * 60 * 1000)

function mkPost(slug: string, overrides: Partial<Post> = {}): Post {
  return {
    slug,
    title: slug,
    date: "2026-01-01",
    tags: [],
    description: "",
    draft: false,
    visible: true,
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
const { requireDb } = await import("../src/db")

beforeAll(async () => {
  await content.savePost(
    mkPost("live", { date: "2026-01-05", tags: ["Visible"] })
  )
  await content.savePost(mkPost("past", { date: "2026-01-04", publishAt: PAST }))
  await content.savePost(
    mkPost("future", {
      date: "2026-01-03",
      publishAt: FUTURE,
      tags: ["Hidden"],
      content: "moonphase body",
    })
  )
  await content.savePost(
    mkPost("draft", { date: "2026-01-02", draft: true, tags: ["DraftOnly"] })
  )
  await content.savePost(
    mkPost("draft-scheduled", { date: "2026-01-01", draft: true, publishAt: FUTURE })
  )
  await content.savePost(mkPost("flip", { date: "2025-12-31", publishAt: FUTURE }))
  await content.savePost(
    mkPost("hidden", {
      date: "2026-01-06",
      visible: false,
      tags: ["Secret"],
      content: "vault body",
    })
  )
  await content.savePost(
    mkPost("hidden-draft", { date: "2025-12-30", draft: true, visible: false })
  )
  await content.savePost(
    mkPost("hidden-scheduled", {
      date: "2025-12-29",
      visible: false,
      publishAt: FUTURE,
    })
  )
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("public visibility with publish_at", () => {
  it("getAllPosts excludes drafts and future-scheduled posts by default", async () => {
    const slugs = (await content.getAllPosts()).map((p) => p.slug)
    expect(slugs).toEqual(["live", "past"])
  })

  it("getAllPosts(includeDrafts) returns everything", async () => {
    const slugs = (await content.getAllPosts(true)).map((p) => p.slug)
    expect(slugs.sort()).toEqual(
      [
        "draft",
        "draft-scheduled",
        "flip",
        "future",
        "hidden",
        "hidden-draft",
        "hidden-scheduled",
        "live",
        "past",
      ].sort()
    )
  })

  it("getPublishedCount counts only live posts", async () => {
    expect(await content.getPublishedCount()).toBe(2)
  })

  it("getPostBySlug hides a scheduled post publicly but not from admin", async () => {
    expect(await content.getPostBySlug("future")).toBeNull()
    const adminView = await content.getPostBySlug("future", true)
    expect(adminView?.publishAt).toBe(FUTURE)
  })

  it("getHomepageLatestPosts never surfaces scheduled posts", async () => {
    const slugs = (await content.getHomepageLatestPosts(6)).map((p) => p.slug)
    expect(slugs).toEqual(["live", "past"])
  })

  it("getAllTags only lists tags of live posts", async () => {
    expect(await content.getAllTags()).toEqual(["visible"])
  })
})

describe("search excludes scheduled posts", () => {
  it("a body term unique to a future post finds nothing", async () => {
    expect(await content.searchPublishedPosts(["moonphase"])).toEqual([])
  })

  it("the same term is findable from the admin-side reader", async () => {
    const post = await content.getPostBySlug("future", true)
    expect(post?.content).toContain("moonphase")
  })
})

describe("movePost publishing semantics", () => {
  it("publishing a scheduled post means publish NOW — schedule is cleared", async () => {
    const moved = await content.movePost("flip", false)
    expect(moved?.publishAt).toBeNull()
    // …and it is publicly visible immediately.
    expect(await content.getPostBySlug("flip")).not.toBeNull()
  })

  it("re-drafting a post keeps any schedule for later", async () => {
    const moved = await content.movePost("future", true)
    expect(moved?.draft).toBe(true)
    const back = await content.getPostBySlug("future", true)
    expect(back?.publishAt).toBe(FUTURE)
  })
})

describe("hidden posts (visible = 0)", () => {
  it("public readers never see a hidden post", async () => {
    expect(await content.getPostBySlug("hidden")).toBeNull()
    expect((await content.getAllPosts()).map((p) => p.slug)).not.toContain(
      "hidden"
    )
    expect(
      (await content.getHomepageLatestPosts(10)).map((p) => p.slug)
    ).not.toContain("hidden")
  })

  it("admin readers still get it", async () => {
    const post = await content.getPostBySlug("hidden", true)
    expect(post?.visible).toBe(false)
  })

  it("hidden tags and bodies stay out of tags and search", async () => {
    expect(await content.getAllTags()).not.toContain("secret")
    expect(await content.searchPublishedPosts(["vault"])).toEqual([])
  })
})

describe("visibility × draft/schedule matrix", () => {
  it("hidden + draft: public queries skip it, admin list still includes it", async () => {
    expect(await content.getPostBySlug("hidden-draft")).toBeNull()
    expect((await content.getAllPosts()).map((p) => p.slug)).not.toContain(
      "hidden-draft"
    )
    expect((await content.getAllPosts(true)).map((p) => p.slug)).toContain(
      "hidden-draft"
    )
  })

  it("hidden + scheduled: public null, admin sees visible=false with the future schedule", async () => {
    expect(await content.getPostBySlug("hidden-scheduled")).toBeNull()
    expect((await content.getAllPosts()).map((p) => p.slug)).not.toContain(
      "hidden-scheduled"
    )
    const adminView = await content.getPostBySlug("hidden-scheduled", true)
    expect(adminView?.visible).toBe(false)
    expect(adminView?.publishAt).toBe(FUTURE)
  })
})

describe("setPostVisible", () => {
  it("hides and restores a live post across public queries", async () => {
    const slug = "visibility-toggle"
    await content.savePost(mkPost(slug, { date: "2026-01-07" }))
    expect(await content.getPostBySlug(slug)).not.toBeNull()

    const hidden = await content.setPostVisible(slug, false)
    expect(hidden?.visible).toBe(false)
    expect(await content.getPostBySlug(slug)).toBeNull()
    expect((await content.getAllPosts()).map((p) => p.slug)).not.toContain(slug)

    const shown = await content.setPostVisible(slug, true)
    expect(shown?.visible).toBe(true)
    expect(await content.getPostBySlug(slug)).not.toBeNull()
  })

  it("is idempotent when the state already matches — no write, no updated_at bump", async () => {
    const slug = "visibility-idempotent"
    await content.savePost(mkPost(slug))
    // Pin updated_at to a value datetime('now') can never produce, so an
    // unconditional UPDATE is visible even within the same second.
    const db = requireDb()
    await db.execute({
      sql: "UPDATE posts SET updated_at = '2000-01-01 00:00:00' WHERE slug = ?",
      args: [slug],
    })

    const same = await content.setPostVisible(slug, true)
    expect(same?.visible).toBe(true)
    const raw = await db.execute({
      sql: "SELECT updated_at FROM posts WHERE slug = ?",
      args: [slug],
    })
    expect(raw.rows[0]?.updated_at).toBe("2000-01-01 00:00:00")
  })

  it("returns null for a missing post", async () => {
    expect(await content.setPostVisible("no-such-post", false)).toBeNull()
  })

  it("savePost updates do not overwrite visibility", async () => {
    const slug = "visibility-immutable"
    await content.savePost(mkPost(slug, { visible: false }))
    await content.savePost(
      mkPost(slug, { visible: true, content: "changed body" })
    )
    const stored = await content.getPostBySlug(slug, true)
    expect(stored?.visible).toBe(false)
    expect(stored?.content).toBe("changed body")
  })
})

describe("savePost rename", () => {
  it("keeps a hidden post hidden across a slug change", async () => {
    const oldSlug = "hidden-rename-old"
    const newSlug = "hidden-rename-new"
    await content.savePost(mkPost(oldSlug, { visible: false }), oldSlug)
    await content.savePost(mkPost(newSlug, { visible: false }), oldSlug)

    const adminView = await content.getPostBySlug(newSlug, true)
    expect(adminView?.visible).toBe(false)
    expect(await content.getPostBySlug(newSlug)).toBeNull()
  })

  it("rename keeps the stored pin across a slug change", async () => {
    const oldSlug = "pin-rename-old"
    const newSlug = "pin-rename-new"
    await content.savePost(mkPost(oldSlug))
    await content.setPostPinned(oldSlug, true)
    // Stale caller: its Post predates the pin.
    await content.savePost(mkPost(newSlug), oldSlug)

    const adminView = await content.getPostBySlug(newSlug, true)
    expect(adminView?.pinnedAt).not.toBeNull()
  })

  it("rename takes visibility from the stored row, not a stale caller", async () => {
    const oldSlug = "hidden-rename-stale-old"
    const newSlug = "hidden-rename-stale-new"
    await content.savePost(mkPost(oldSlug, { visible: false }))
    // The caller loaded the post before it was hidden elsewhere, so its
    // Post still says visible: true. A rename is DELETE + INSERT — the
    // new row must inherit the DB value, or the hide is silently undone.
    await content.savePost(mkPost(newSlug, { visible: true }), oldSlug)

    const adminView = await content.getPostBySlug(newSlug, true)
    expect(adminView?.visible).toBe(false)
    expect(await content.getPostBySlug(newSlug)).toBeNull()
  })
})
