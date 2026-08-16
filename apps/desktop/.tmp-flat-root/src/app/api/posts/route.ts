import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth } from "@/lib/api-auth"
import {
  getAllPosts,
  savePost,
  getPublishedPosts,
  getPostBySlug,
  deletePost,
  movePost,
  setPostPinned,
  slugify,
} from "@zlog/database"
import { computeReadingStats } from "@zlog/database"
import { type Post } from "@zlog/database"

const postBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  cover: z.string().max(500).optional().or(z.literal("")),
  draft: z.boolean().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
})

export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  // Single post query
  const slug = searchParams.get("slug")
  if (slug) {
    const post = await getPostBySlug(slug, true)
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }
    return NextResponse.json({ post })
  }

  // List query — default to published only for safety.
  const includeDrafts = searchParams.get("includeDrafts") === "true"
  const posts = includeDrafts ? await getAllPosts(true) : await getPublishedPosts()
  return NextResponse.json({ posts })
}

export async function POST(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parseResult = postBodySchema.safeParse(await request.json())
  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    )
  }

  const body = parseResult.data
  const slug = body.slug || slugify(body.title || "")

  if (!slug) {
    return NextResponse.json(
      { error: "Slug could not be generated" },
      { status: 400 }
    )
  }

  // Check for duplicate slug
  const existing = await getPostBySlug(slug, true)
  if (existing) {
    return NextResponse.json(
      { error: "A post with this slug already exists" },
      { status: 409 }
    )
  }

  const content = body.content || ""
  const stats = computeReadingStats(content)

  const post: Post = {
    slug,
    title: body.title || "Untitled",
    date: body.date || new Date().toISOString().split("T")[0],
    updated: body.updated || undefined,
    tags: body.tags || [],
    description: body.description || "",
    cover: body.cover || undefined,
    draft: body.draft ?? true,
    pinnedAt: null,
    content,
    wordCount: stats.wordCount,
    readingTime: stats.readingTime,
  }

  await savePost(post)
  return NextResponse.json({ post }, { status: 201 })
}

// PUT /api/posts?slug=xxx — update a post
export async function PUT(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const slug = searchParams.get("slug")
  if (!slug) {
    return NextResponse.json({ error: "Slug is required" }, { status: 400 })
  }

  const existingPost = await getPostBySlug(slug, true)
  if (!existingPost) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 })
  }

  const parseResult = postBodySchema.safeParse(await request.json())
  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    )
  }

  const body = parseResult.data
  const newSlug = body.slug || slug
  if (newSlug !== slug) {
    // Check for duplicate slug on rename
    const conflict = await getPostBySlug(newSlug, true)
    if (conflict) {
      return NextResponse.json(
        { error: "A post with this slug already exists" },
        { status: 409 }
      )
    }
    await deletePost(slug)
  }

  const content = body.content ?? existingPost.content
  const stats = computeReadingStats(content)

  const updatedPost: Post = {
    ...existingPost,
    title: body.title ?? existingPost.title,
    slug: newSlug,
    date: body.date ?? existingPost.date,
    updated: new Date().toISOString().split("T")[0],
    tags: body.tags ?? existingPost.tags,
    description: body.description ?? existingPost.description,
    cover: body.cover ?? existingPost.cover,
    draft: body.draft ?? existingPost.draft,
    content,
    wordCount: stats.wordCount,
    readingTime: stats.readingTime,
  }

  await savePost(updatedPost, slug)
  return NextResponse.json({ post: updatedPost })
}

// DELETE /api/posts?slug=xxx — delete a post
export async function DELETE(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const slug = searchParams.get("slug")
  if (!slug) {
    return NextResponse.json({ error: "Slug is required" }, { status: 400 })
  }

  const deleted = await deletePost(slug)
  if (!deleted) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}

// PATCH /api/posts?slug=xxx — publish / unpublish and/or pin / unpin
export async function PATCH(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const slug = searchParams.get("slug")
  if (!slug) {
    return NextResponse.json({ error: "Slug is required" }, { status: 400 })
  }

  const existingPost = await getPostBySlug(slug, true)
  if (!existingPost) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 })
  }

  const parseResult = z
    .object({
      draft: z.boolean().optional(),
      pinned: z.boolean().optional(),
    })
    .refine((b) => b.draft !== undefined || b.pinned !== undefined, {
      message: "draft or pinned is required",
    })
    .safeParse(await request.json())
  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    )
  }

  const { draft, pinned } = parseResult.data
  let updatedPost: Post | null = existingPost

  if (draft !== undefined) {
    updatedPost = await movePost(slug, draft)
    if (!updatedPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }
  }

  if (pinned !== undefined) {
    // A pin on a draft would sit invisible until publication, then
    // silently jump the post to the top of the homepage — reject it.
    // (draft:false + pinned:true together — publish-and-pin — is fine:
    // the draft flip above already ran.)
    if (pinned && updatedPost.draft) {
      return NextResponse.json(
        { error: "Publish the post before pinning it" },
        { status: 400 }
      )
    }
    updatedPost = await setPostPinned(slug, pinned)
    if (!updatedPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }
  }

  return NextResponse.json({ post: updatedPost })
}
