import { describe, expect, it } from "vitest"
import {
  MY_COMMENTS_MAX,
  MY_COMMENTS_STORAGE_KEY,
  findUnseenReplies,
  markSeen,
  mergeMyComment,
  parseMyComments,
  type MyCommentEntry,
} from "@/lib/my-comments"

const entry = (id: number, postSlug = "post-a", seenUpTo = 0): MyCommentEntry => ({
  id,
  postSlug,
  seenUpTo,
})

describe("parseMyComments", () => {
  it("returns [] for null / empty / non-array JSON", () => {
    expect(parseMyComments(null)).toEqual([])
    expect(parseMyComments("")).toEqual([])
    expect(parseMyComments("{}")).toEqual([])
    expect(parseMyComments('"nope"')).toEqual([])
  })

  it("returns [] for garbage that JSON.parse rejects", () => {
    expect(parseMyComments("{not json")).toEqual([])
    expect(parseMyComments("undefined")).toEqual([])
  })

  it("drops malformed entries but keeps valid ones", () => {
    const raw = JSON.stringify([
      entry(1),
      null,
      42,
      { id: "1", postSlug: "x", seenUpTo: 0 }, // id as string
      { id: 2, postSlug: "x" }, // missing seenUpTo
      { id: 3, postSlug: 5, seenUpTo: 0 }, // postSlug not a string
      entry(4, "post-b", 7),
    ])
    expect(parseMyComments(raw)).toEqual([entry(1), entry(4, "post-b", 7)])
  })

  it("round-trips a well-formed list", () => {
    const list = [entry(1), entry(2, "post-b", 3)]
    expect(parseMyComments(JSON.stringify(list))).toEqual(list)
  })
})

describe("mergeMyComment", () => {
  it("appends new entries", () => {
    expect(mergeMyComment([entry(1)], entry(2))).toEqual([entry(1), entry(2)])
  })

  it("upserts by id without duplicating (fresh seenUpTo wins)", () => {
    const merged = mergeMyComment([entry(1), entry(2)], entry(1, "post-a", 9))
    // Position is preserved for an existing id (append order = insert order).
    expect(merged).toEqual([entry(2), entry(1, "post-a", 9)])
    expect(merged.filter((e) => e.id === 1)).toHaveLength(1)
  })

  it("caps at MY_COMMENTS_MAX, dropping the oldest", () => {
    let list: MyCommentEntry[] = []
    for (let i = 1; i <= MY_COMMENTS_MAX + 5; i++) {
      list = mergeMyComment(list, entry(i))
    }
    expect(list).toHaveLength(MY_COMMENTS_MAX)
    expect(list[0].id).toBe(6)
    expect(list[list.length - 1].id).toBe(MY_COMMENTS_MAX + 5)
  })
})

describe("markSeen", () => {
  it("raises the watermark only for the addressed entry", () => {
    const list = [entry(1, "a", 2), entry(2, "b", 0)]
    expect(markSeen(list, 1, 5)).toEqual([entry(1, "a", 5), entry(2, "b", 0)])
  })

  it("never lowers a watermark", () => {
    const list = [entry(1, "a", 7)]
    expect(markSeen(list, 1, 3)).toEqual([entry(1, "a", 7)])
  })

  it("is a no-op for an unknown id", () => {
    const list = [entry(1)]
    expect(markSeen(list, 99, 5)).toEqual(list)
  })
})

describe("findUnseenReplies", () => {
  const reply = (id: number, parentId: number | null) => ({ id, parentId })

  it("returns replies newer than the watermark, oldest first", () => {
    const entries = [entry(10, "a", 3)]
    const replies = [reply(5, 10), reply(2, 10), reply(4, 10)]
    const unseen = findUnseenReplies(entries, replies)
    expect(unseen.map((u) => u.reply.id)).toEqual([4, 5])
    expect(unseen[0].entry.id).toBe(10)
  })

  it("ignores replies to comments this browser did not post", () => {
    const entries = [entry(10, "a", 0)]
    const unseen = findUnseenReplies(entries, [reply(1, 999)])
    expect(unseen).toEqual([])
  })

  it("ignores roots (parentId null)", () => {
    const entries = [entry(10)]
    expect(findUnseenReplies(entries, [reply(11, null)])).toEqual([])
  })

  it("returns nothing when every reply is at or below the watermark", () => {
    const entries = [entry(10, "a", 5)]
    expect(findUnseenReplies(entries, [reply(4, 10), reply(5, 10)])).toEqual([])
  })

  it("attributes each reply to its own parent entry", () => {
    const entries = [entry(10, "a", 0), entry(20, "b", 0)]
    const unseen = findUnseenReplies(entries, [reply(21, 20), reply(11, 10)])
    expect(unseen.map((u) => [u.reply.id, u.entry.id])).toEqual([
      [11, 10],
      [21, 20],
    ])
  })
})

describe("constants", () => {
  it("storage key is versioned", () => {
    expect(MY_COMMENTS_STORAGE_KEY).toBe("zlog:my-comments:v1")
  })
})
