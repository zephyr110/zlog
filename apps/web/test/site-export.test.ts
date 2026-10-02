import { describe, expect, it } from "vitest"
import { inflateRawSync } from "node:zlib"
import { buildZip, crc32 } from "@/lib/zip"
import {
  buildExportEntries,
  exportFilename,
  safeExportSlug,
  serializePostMarkdown,
} from "@/lib/site-export"
import { type Post } from "@zlog/database"

const AT = new Date("2026-10-02T08:30:00.000Z")
const encoder = new TextEncoder()

function mkPost(overrides: Partial<Post> = {}): Post {
  return {
    slug: "hello",
    title: "Hello",
    date: "2026-01-05",
    tags: [],
    description: "",
    draft: false,
    pinnedAt: null,
    publishAt: null,
    content: "Body.\n",
    wordCount: 1,
    readingTime: 1,
    ...overrides,
  }
}

/** 测试侧最小解析器：顺序读本地文件头、inflateRaw 取回原文——与
 *  buildZip 相互印证。与真 unzip 的互操作由 E2E 验证。 */
function readZip(bytes: Uint8Array): { path: string; text: string }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  const out: { path: string; text: string }[] = []
  let at = 0
  while (view.getUint32(at, true) === 0x04034b50) {
    const compSize = view.getUint32(at + 18, true)
    const rawSize = view.getUint32(at + 22, true)
    const nameLen = view.getUint16(at + 26, true)
    const extraLen = view.getUint16(at + 28, true)
    const name = decoder.decode(bytes.subarray(at + 30, at + 30 + nameLen))
    const dataAt = at + 30 + nameLen + extraLen
    const raw = bytes.subarray(dataAt, dataAt + compSize)
    const text = inflateRawSync(raw).toString("utf8")
    expect(Buffer.byteLength(text, "utf8")).toBe(rawSize)
    out.push({ path: name, text })
    at = dataAt + compSize
  }
  return out
}

describe("crc32", () => {
  it("标准测试向量", () => {
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})

describe("buildZip", () => {
  it("本地头可解析、inflate 还原原文（含中文与空文件）", () => {
    const entries = [
      { path: "manifest.json", text: '{"a":1}\n' },
      { path: "posts/中文.md", text: "正文\n" },
      { path: "empty.txt", text: "" },
    ]
    expect(readZip(buildZip(entries, AT))).toEqual(entries)
  })

  it("同一输入与时间戳产出同一字节", () => {
    const entries = [{ path: "a.md", text: "x" }]
    expect(buildZip(entries, AT)).toEqual(buildZip(entries, AT))
  })

  it("空条目列表也产出合法骨架（EOCD）", () => {
    const bytes = buildZip([], AT)
    expect(bytes.length).toBe(22)
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x06054b50)
  })
})

describe("serializePostMarkdown", () => {
  it("完整字段逐行输出", () => {
    const md = serializePostMarkdown(
      mkPost({
        title: "Hello",
        tags: ["tech", "生活"],
        description: "Desc",
        cover: "https://x/y.png",
        updated: "2026-02-01",
        pinnedAt: "2026-01-06 00:00:00",
        publishAt: "2026-03-01 08:00:00",
      })
    )
    expect(md).toBe(
      [
        "---",
        'title: "Hello"',
        'slug: "hello"',
        'date: "2026-01-05"',
        'updated: "2026-02-01"',
        'tags: ["tech", "生活"]',
        'description: "Desc"',
        'cover: "https://x/y.png"',
        "draft: false",
        'pinnedAt: "2026-01-06 00:00:00"',
        'publishAt: "2026-03-01 08:00:00"',
        "---",
        "",
        "Body.",
        "",
      ].join("\n")
    )
  })

  it("可空字段省略，正文补尾随换行", () => {
    const md = serializePostMarkdown(mkPost({ content: "No newline" }))
    expect(md).not.toContain("updated:")
    expect(md).not.toContain("cover:")
    expect(md).not.toContain("pinnedAt:")
    expect(md).not.toContain("publishAt:")
    expect(md).toContain("draft: false\n---\n\nNo newline\n")
    expect(md.endsWith("No newline\n")).toBe(true)
  })

  it("引号与换行按 JSON 转义（合法 YAML 双引号标量）", () => {
    const md = serializePostMarkdown(
      mkPost({ description: 'He said "hi"\nsecond' })
    )
    expect(md).toContain('description: "He said \\"hi\\"\\nsecond"')
  })

  it("草稿标记保留", () => {
    expect(serializePostMarkdown(mkPost({ draft: true }))).toContain(
      "draft: true"
    )
  })
})

describe("safeExportSlug", () => {
  it("路径分隔符与点前缀不会逃出 posts/", () => {
    expect(safeExportSlug("hello")).toBe("hello")
    expect(safeExportSlug("a/b")).toBe("a-b")
    expect(safeExportSlug("..\\evil")).toBe("evil")
    expect(safeExportSlug("../../etc/passwd")).toBe("etc-passwd")
    expect(safeExportSlug("...")).toBe("post")
    expect(safeExportSlug("ends-with-dot.")).toBe("ends-with-dot")
  })
})

describe("exportFilename", () => {
  it("UTC 日期命名", () => {
    expect(exportFilename(AT)).toBe("zlog-export-2026-10-02.zip")
    expect(exportFilename(new Date("2026-01-09T23:59:59Z"))).toBe(
      "zlog-export-2026-01-09.zip"
    )
  })
})

describe("buildExportEntries", () => {
  it("manifest 在前、草稿仍导出、计数正确", () => {
    const posts = [
      mkPost({ slug: "hello", title: "Hello" }),
      mkPost({ slug: "draft-one", draft: true }),
    ]
    const entries = buildExportEntries(posts, AT, "Zlog")
    expect(entries.map((e) => e.path)).toEqual([
      "manifest.json",
      "posts/hello.md",
      "posts/draft-one.md",
    ])
    const manifest = JSON.parse(entries[0].text)
    expect(manifest).toMatchObject({
      generator: "zlog",
      version: 1,
      exportedAt: "2026-10-02T08:30:00.000Z",
      siteName: "Zlog",
      counts: { total: 2, published: 1, drafts: 1 },
      files: ["posts/hello.md", "posts/draft-one.md"],
    })
  })

  it("空站导出仍带合法 manifest", () => {
    const entries = buildExportEntries([], AT, "Zlog")
    expect(entries).toHaveLength(1)
    expect(JSON.parse(entries[0].text).counts).toEqual({
      total: 0,
      published: 0,
      drafts: 0,
    })
  })
})
