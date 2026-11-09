export interface Post {
  slug: string
  title: string
  date: string
  updated?: string
  tags: string[]
  description: string
  cover?: string
  draft: boolean
  /** 是否在前台展示；false 时所有公开页面都不出现，但不改变发布语义。 */
  visible: boolean
  pinnedAt: string | null
  /** UTC "YYYY-MM-DD HH:MM:SS" — while in the future (and the post is
   *  not a draft) the post is hidden from every public surface. */
  publishAt: string | null
  content: string
  wordCount: number
  readingTime: number
}

export interface PostSummary {
  slug: string
  title: string
  date: string
  updated?: string
  tags: string[]
  description: string
  cover?: string
  draft: boolean
  /** 是否在前台展示；false 时所有公开页面都不出现，但不改变发布语义。 */
  visible: boolean
  pinnedAt: string | null
  publishAt: string | null
  wordCount: number
  readingTime: number
}

export interface AuthUser {
  username: string
}
