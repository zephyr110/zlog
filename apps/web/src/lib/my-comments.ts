// In-site reply notifications for anonymous commenters.
//
// Guests have no accounts and the site has no email service, so "your
// comment got a reply" is tracked in the visitor's own browser: every
// successful post records the new comment id here, and the notification
// banner asks GET /api/comments/replies for replies under those ids.
// Comment ids are AUTOINCREMENT, so "newer" is simply "larger" — the
// per-entry watermark (seenUpTo) is the id of the newest reply already
// surfaced to the visitor.

import { REPLY_IDS_MAX } from "./comment-shared"

export interface MyCommentEntry {
  /** The comment this browser posted. */
  id: number
  /** Where it was posted — the notification links back here. */
  postSlug: string
  /** Highest reply id already surfaced (0 = none yet). */
  seenUpTo: number
}

/** Newest N entries are kept — older ones silently age out. The replies
 *  route caps its id list at the same constant, so the poll can never
 *  exceed the server's limit. */
export const MY_COMMENTS_MAX = REPLY_IDS_MAX

export const MY_COMMENTS_STORAGE_KEY = "zlog:my-comments:v1"

function isEntry(value: unknown): value is MyCommentEntry {
  if (typeof value !== "object" || value === null) return false
  const e = value as Record<string, unknown>
  return (
    typeof e.id === "number" &&
    Number.isFinite(e.id) &&
    typeof e.postSlug === "string" &&
    typeof e.seenUpTo === "number"
  )
}

/** Safe parse of the stored JSON — any corruption degrades to []. */
export function parseMyComments(raw: string | null): MyCommentEntry[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data
      .filter(isEntry)
      .map((e) => ({ id: e.id, postSlug: e.postSlug, seenUpTo: e.seenUpTo }))
  } catch {
    return []
  }
}

/** Upsert by comment id, keeping append order and the newest cap. */
export function mergeMyComment(
  entries: MyCommentEntry[],
  entry: MyCommentEntry
): MyCommentEntry[] {
  const next = [...entries.filter((e) => e.id !== entry.id), entry]
  return next.length > MY_COMMENTS_MAX
    ? next.slice(next.length - MY_COMMENTS_MAX)
    : next
}

/** Raise the seen watermark for one of my comments (never lowers it). */
export function markSeen(
  entries: MyCommentEntry[],
  parentId: number,
  upTo: number
): MyCommentEntry[] {
  return entries.map((e) =>
    e.id === parentId && upTo > e.seenUpTo ? { ...e, seenUpTo: upTo } : e
  )
}

/** Replies that have not been surfaced yet, oldest first. Replies whose
 *  parent is not in the list (someone else's comment) are ignored. */
export function findUnseenReplies<
  T extends { id: number; parentId: number | null },
>(
  entries: MyCommentEntry[],
  replies: T[]
): { reply: T; entry: MyCommentEntry }[] {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const unseen: { reply: T; entry: MyCommentEntry }[] = []
  for (const reply of replies) {
    if (reply.parentId == null) continue
    const entry = byId.get(reply.parentId)
    if (!entry) continue
    if (reply.id > entry.seenUpTo) unseen.push({ reply, entry })
  }
  return unseen.sort((a, b) => a.reply.id - b.reply.id)
}

// ── localStorage wrappers (client-only, best-effort) ────────────────────

function readStorage(): MyCommentEntry[] {
  if (typeof window === "undefined") return []
  try {
    return parseMyComments(window.localStorage.getItem(MY_COMMENTS_STORAGE_KEY))
  } catch {
    // Private mode / disabled storage — notification is best-effort.
    return []
  }
}

function writeStorage(entries: MyCommentEntry[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(MY_COMMENTS_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Storage full/unavailable — the comment itself is already posted;
    // only the local notification trail is lost.
  }
}

/** Record a comment this browser just posted successfully. */
export function recordMyComment(id: number, postSlug: string): void {
  writeStorage(mergeMyComment(readStorage(), { id, postSlug, seenUpTo: 0 }))
}

export function listMyComments(): MyCommentEntry[] {
  return readStorage()
}

/** Surface every reply currently shown for `entry` — the watermark moves
 *  to the newest in the batch so the next check stays quiet. */
export function markRepliesSeen(
  entry: MyCommentEntry,
  replies: { id: number }[]
): void {
  const upTo = replies.reduce((max, r) => Math.max(max, r.id), entry.seenUpTo)
  writeStorage(markSeen(readStorage(), entry.id, upTo))
}
