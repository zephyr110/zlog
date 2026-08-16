import { type Post, type PostSummary } from "./types"

const READING_SPEED_WPM = 200 // Chinese/English average

export function computeReadingStats(content: string): {
  wordCount: number
  readingTime: number
} {
  // CJK ideographs / hiragana / katakana / hangul each count as one word.
  // Local /g RegExp — avoid a shared lastIndex across calls.
  const cjk = /[一-龥\u3040-ゟ゠-ヿ가-힯]/g
  const cjkCount = (content.match(cjk) || []).length
  const nonCjkWords = content
    .replace(cjk, " ")
    .split(/\s+/)
    .filter(Boolean).length
  const wordCount = cjkCount + nonCjkWords
  const readingTime = Math.max(1, Math.ceil(wordCount / READING_SPEED_WPM))
  return { wordCount, readingTime }
}

export function toPostSummary(post: Post): PostSummary {
  return {
    slug: post.slug,
    title: post.title,
    date: post.date,
    updated: post.updated,
    tags: post.tags,
    description: post.description,
    cover: post.cover,
    draft: post.draft,
    pinnedAt: post.pinnedAt,
    wordCount: post.wordCount,
    readingTime: post.readingTime,
  }
}
