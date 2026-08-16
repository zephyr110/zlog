export interface Post {
  slug: string
  title: string
  date: string
  updated?: string
  tags: string[]
  description: string
  cover?: string
  draft: boolean
  pinnedAt: string | null
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
  pinnedAt: string | null
  wordCount: number
  readingTime: number
}

export interface AuthUser {
  username: string
}
