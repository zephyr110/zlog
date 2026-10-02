import { type Post } from "@zlog/core"

/**
 * Pure helpers for server-side search: query tokenizing, scoring, and
 * snippet extraction. The SQL (LIKE over published posts) lives in
 * @zlog/database — everything here is deterministic and unit-tested.
 */

export interface SearchHit {
  slug: string
  title: string
  date: string
  tags: string[]
  snippet: string
  score: number
}

/** Terms are AND-ed by the query layer — cap them so a query pasted from
 *  a whole paragraph can't fan out into hundreds of LIKE clauses. */
const MAX_TERMS = 6

/** Split a query into search terms: whitespace-separated (CJK queries
 *  have no spaces and come through as one term), deduped
 *  case-insensitively, order preserved. */
export function tokenizeQuery(query: string): string[] {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const raw of query.trim().split(/\s+/)) {
    const term = raw.trim()
    if (!term) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    terms.push(term)
    if (terms.length >= MAX_TERMS) break
  }
  return terms
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let idx = haystack.indexOf(needle)
  // No need to count past the scoring saturation point — a pathological
  // body with thousands of hits shouldn't cost thousands of scans.
  while (idx !== -1 && count < 25) {
    count++
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return count
}

/** Light Markdown → plain text for snippet display: images become their
 *  alt text, links their label, code fences and heading/quote markers are
 *  dropped, whitespace collapses. Readability over fidelity. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → label
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // heading markers
    .replace(/^\s{0,3}>\s?/gm, "") // blockquote markers
    .replace(/[*_~]{1,3}/g, "") // emphasis markers
    .replace(/\s+/g, " ")
    .trim()
}

/** Relevance: title ≫ description > body; body hits saturate at 5 so one
 *  keyword-stuffed article can't dominate the ranking. */
export function scorePost(
  post: Pick<Post, "title" | "description" | "content">,
  terms: string[]
): number {
  const title = post.title.toLowerCase()
  const description = post.description.toLowerCase()
  const content = post.content.toLowerCase()
  let score = 0
  for (const term of terms) {
    const t = term.toLowerCase()
    if (title.includes(t)) score += 10
    if (description.includes(t)) score += 4
    const inBody = countOccurrences(content, t)
    if (inBody > 0) score += 1 + Math.min(inBody, 5)
  }
  return score
}

const SNIPPET_CONTEXT = 60
const SNIPPET_MAX = 160

/** A window around the earliest hit of any term in the stripped body;
 *  falls back to the body's opening when the term only matched the title
 *  or description. */
export function makeSnippet(content: string, terms: string[]): string {
  const text = stripMarkdown(content)
  if (!text) return ""
  const lower = text.toLowerCase()
  let at = -1
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase())
    if (idx !== -1 && (at === -1 || idx < at)) at = idx
  }
  const start = at === -1 ? 0 : Math.max(0, at - SNIPPET_CONTEXT)
  const end = Math.min(text.length, start + SNIPPET_MAX)
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`
}

/** Rank candidates: score desc, then date desc (ISO strings compare
 *  correctly), then slug so equal posts keep a stable order. */
export function rankSearchResults(posts: Post[], terms: string[]): SearchHit[] {
  return posts
    .map((post) => ({
      slug: post.slug,
      title: post.title,
      date: post.date,
      tags: post.tags,
      snippet: makeSnippet(post.content, terms),
      score: scorePost(post, terms),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
    )
}
