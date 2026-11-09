import { type Post } from "@zlog/core"
import { safeSlug } from "@zlog/core"

/** posts 表（及其历史快照表 post_revisions——同构行）与 Post 之间的
 *  行映射。content.ts 与 revisions.ts 共用，避免两份漂移。 */

export function rowToPost(row: any): Post {
  let tags: string[] = []
  try {
    tags = JSON.parse(row.tags || "[]")
  } catch {
    tags = []
  }

  return {
    slug: row.slug,
    title: row.title,
    date: row.date,
    updated: row.updated ?? undefined,
    tags,
    description: row.description,
    cover: row.cover ?? undefined,
    draft: Boolean(row.draft),
    // 旧库/旧快照缺列时默认展示，避免迁移未到时误隐藏全部文章。
    visible: row.visible == null ? true : Boolean(row.visible),
    pinnedAt: (row.pinned_at as string | null) ?? null,
    publishAt: (row.publish_at as string | null) ?? null,
    content: row.content,
    wordCount: row.word_count,
    readingTime: row.reading_time,
  }
}

export function toParams(post: Post) {
  return {
    slug: safeSlug(post.slug),
    title: post.title,
    date: post.date,
    updated: post.updated ?? null,
    tags: JSON.stringify(post.tags),
    description: post.description,
    cover: post.cover ?? null,
    draft: post.draft ? 1 : 0,
    visible: post.visible ? 1 : 0,
    pinned_at: post.pinnedAt,
    publish_at: post.publishAt,
    content: post.content,
    word_count: post.wordCount,
    reading_time: post.readingTime,
  }
}
