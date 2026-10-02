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
      ["draft", "draft-scheduled", "flip", "future", "live", "past"].sort()
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
