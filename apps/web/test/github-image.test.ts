import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cdnUrl } from "@/lib/github-image"

const realCdnBase = process.env.BLOG_IMG_CDN_BASE

beforeEach(() => {
  process.env.BLOG_IMG_CDN_BASE = "https://cdn.jsdelivr.net/gh/zephyr110/blog-img"
})

afterEach(() => {
  if (realCdnBase === undefined) delete process.env.BLOG_IMG_CDN_BASE
  else process.env.BLOG_IMG_CDN_BASE = realCdnBase
})

describe("cdnUrl", () => {
  it("joins the CDN base with the filename", () => {
    expect(cdnUrl("1735000000000-logo.svg")).toBe(
      "https://cdn.jsdelivr.net/gh/zephyr110/blog-img/1735000000000-logo.svg"
    )
  })

  it("uses the configured base when set", () => {
    process.env.BLOG_IMG_CDN_BASE = "https://fastly.jsdelivr.net/gh/x/y"
    expect(cdnUrl("a.png")).toBe("https://fastly.jsdelivr.net/gh/x/y/a.png")
  })
})
