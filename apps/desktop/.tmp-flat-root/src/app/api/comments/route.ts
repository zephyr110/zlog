import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getClientIp, hashIp } from "@/lib/comment-ip"
import {
  verifyCommentSession,
  isBeforeMinSubmitDelay,
} from "@/lib/comment-session"
import { type PublicComment } from "@/lib/comment-shared"
import {
  getCommentsByPost,
  getReplyTarget,
  createComment,
  createReply,
  getSiteSettings,
  getPostBySlug,
  consumeRateLimit,
  ipRateScope,
  postRateScope,
  GLOBAL_RATE_SCOPE,
  RATE_LIMIT_IP_WINDOW_MS,
  RATE_LIMIT_IP_MAX,
  RATE_LIMIT_POST_WINDOW_MS,
  RATE_LIMIT_POST_MAX,
  RATE_LIMIT_GLOBAL_WINDOW_MS,
  RATE_LIMIT_GLOBAL_MAX,
} from "@zlog/database"

// ── Validation ──────────────────────────────────────────────────────────

const listQuery = z.object({
  post: z.string().min(1).max(100),
})

const createSchema = z.object({
  postSlug: z.string().min(1).max(100),
  // Optional — an empty/whitespace name becomes "Anonymous_<random>" at
  // insert (the trim transform already accepts "" and whitespace).
  authorName: z.string().trim().max(30).optional(),
  authorEmail: z.string().trim().max(100).optional().or(z.literal("")),
  content: z.string().trim().min(2).max(1000),
  // Reply target — present only for replies; the target is validated
  // against the DB later (exists, same post, root comment).
  parentId: z.number().int().positive().optional(),
  // Signed session token from GET /api/comments/session.
  token: z.string().min(10).max(1000),
  // Token from the Turnstile widget (client-side) — optional only when
  // Turnstile is not configured on the server.
  turnstileToken: z.string().min(1).max(3000).optional(),
  // Honeypot — real visitors never see this field.
  website: z.string().max(500).optional(),
})

/** Anonymous fallback for nameless visitors — Anonymous_ + 8 random
 *  hex chars (collision odds are negligible at comment volume). */
function anonymousName(): string {
  return `Anonymous_${crypto.randomUUID().slice(0, 8)}`
}

/** Max 2 URLs per comment — link spam is the bulk of automated abuse.
 *  Counts full URLs (scheme or www. prefix) and bare domains, each
 *  exactly once — a "www.example.com" URL must not count twice, and
 *  file extensions (package.json) or email domains must not count. */
function countUrls(content: string): number {
  const full = (content.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || []).length
  // After removing full URLs, count bare domain.tld tokens not preceded
  // by @ (email) or a word char / dot (path segments).
  const rest = content.replace(/(?:https?:\/\/|www\.)[^\s<>"']+/gi, " ")
  const bare = (
    rest.match(/(?<![@\w.-])\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi) || []
  ).length
  return full + bare
}

/** A comment made of one repeated character/short loop (aaaa…, 66666…,
 *  lkjhggfd…) is noise. Flag when the distinct-character set is tiny.
 *  Short comments (< 8 chars) are exempt — "哈哈哈", "666", "kkk" are
 *  legitimate human reactions and would otherwise all be rejected. */
function isRepetitiveNoise(content: string): boolean {
  if (content.length < 8) return false
  const distinct = new Set(content.replace(/\s/g, "")).size
  return distinct < Math.max(2, Math.floor(content.length * 0.2))
}

// ── Turnstile ───────────────────────────────────────────────────────────

const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/** Server-side Turnstile validation. Returns false when the widget token
 *  is invalid or the Cloudflare check fails; skips (returns true) only
 *  when Turnstile is not configured at all (degraded mode). */
async function verifyTurnstile(
  widgetToken: string | undefined,
  ip: string
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true // not configured — skip
  if (!widgetToken) return false

  try {
    const body = new FormData()
    body.append("secret", secret)
    body.append("response", widgetToken)
    body.append("remoteip", ip)
    const res = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(2_000),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}

// ── Routes ──────────────────────────────────────────────────────────────

/** Public comment list for one post (oldest first). */
export async function GET(request: NextRequest) {
  const parsed = listQuery.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  )
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid post slug" }, { status: 400 })
  }

  const comments = await getCommentsByPost(parsed.data.post)
  const publicComments: PublicComment[] = comments.map((c) => ({
    id: c.id,
    postSlug: c.postSlug,
    authorName: c.authorName,
    content: c.content,
    parentId: c.parentId,
    createdAt: c.createdAt,
  }))
  return NextResponse.json({ comments: publicComments })
}

/** Guest comment submission — the full anti-spam pipeline. Order is
 *  deliberate: cheap server checks first, then the paid ones. */
export async function POST(request: NextRequest) {
  // 0. Shape
  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid comment" }, { status: 400 })
  }
  const ip = getClientIp(request)
  const ipHash = hashIp(ip)

  // 1. Honeypot — robots fill hidden fields; silently succeed so the
  //    script gets no feedback, but never store the comment. First
  //    check (zero dependencies, no DB): a honeypot-filled probe must
  //    not pay a query nor be told — via a distinguishing error —
  //    whether its payload was valid.
  if (body.website) {
    return NextResponse.json({ ok: true })
  }

  // 2. Master switch (settings) — spam kill-switch. Read straight from
  //    the DB (not getSiteConfig's 1h cache): a multi-instance self-host
  //    without a shared cache store would otherwise keep accepting
  //    comments for up to an hour after the admin flips the switch.
  const settings = await getSiteSettings()
  if (settings && !settings.commentEnabled) {
    return NextResponse.json({ error: "Comments are closed" }, { status: 503 })
  }

  // 3. Signed session token — script POSTs without a session are
  //    rejected before any state is touched.
  const session = await verifyCommentSession(body.token)
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 })
  }
  // 4. Token must match this request (post + visitor IP).
  if (session.postSlug !== body.postSlug || session.ipHash !== ipHash) {
    return NextResponse.json({ error: "Session mismatch" }, { status: 401 })
  }
  // 5. The post must actually exist and be published — comments for
  //    arbitrary slugs would otherwise land in the admin inbox with a
  //    404 link (an open channel when Turnstile is unconfigured).
  {
    const post = await getPostBySlug(body.postSlug, true)
    if (!post || post.draft) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }
  }

  // 6. Time-trap — a script that fetched the session and POSTs
  //    immediately is rejected; humans take longer than 2 s.
  if (isBeforeMinSubmitDelay(session)) {
    return NextResponse.json(
      { error: "Comment submitted too quickly", code: "too_soon" },
      { status: 400 }
    )
  }

  // 7. Reply target — must exist, belong to THIS post, and be a root
  //     comment (single-level nesting: a reply can't reply to a reply).
  //     Runs after the free checks (honeypot, time-trap) but before
  //     Turnstile/rate limits so a bad target burns nothing. The
  //     insert itself re-verifies the parent atomically (createReply),
  //     closing the delete-between-check-and-insert window.
  let parentId: number | null = null
  if (body.parentId != null) {
    const parent = await getReplyTarget(body.parentId)
    if (
      !parent ||
      parent.postSlug !== body.postSlug ||
      parent.parentId !== null
    ) {
      return NextResponse.json(
        { error: "Invalid reply target", code: "invalid_parent" },
        { status: 400 }
      )
    }
    parentId = body.parentId
  }

  // 8. Content sanity — cheap string checks before the paid ones.
  if (countUrls(body.content) > 2) {
    return NextResponse.json(
      { error: "Too many links", code: "invalid_content" },
      { status: 400 }
    )
  }
  if (isRepetitiveNoise(body.content)) {
    return NextResponse.json(
      { error: "Invalid comment", code: "invalid_content" },
      { status: 400 }
    )
  }

  // 9. Turnstile — BEFORE the rate limits: a siteverify failure (or a
  //    Cloudflare outage) must not burn the visitor's IP/post/global
  //    budget, or five transient failures would lock a legit user out
  //    for 15 minutes. The widget token IS single-use, so the client
  //    re-challenges on any failed submit (resetTurnstile) — that is
  //    the trade for keeping the budget intact.
  //    (Skipped entirely when Turnstile is not configured.)
  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    return NextResponse.json(
      { error: "Verification failed", code: "verification_failed" },
      { status: 400 }
    )
  }

  // 10. Rate limits — IP, then per-post, then global (all DB-backed:
  //    serverless instances share no memory).
  const limited = [
    [ipRateScope(ipHash), RATE_LIMIT_IP_WINDOW_MS, RATE_LIMIT_IP_MAX, "Too many comments"],
    [postRateScope(body.postSlug), RATE_LIMIT_POST_WINDOW_MS, RATE_LIMIT_POST_MAX, "Too many comments on this post"],
    [GLOBAL_RATE_SCOPE, RATE_LIMIT_GLOBAL_WINDOW_MS, RATE_LIMIT_GLOBAL_MAX, "Comment flood detected"],
  ] as const
  for (const [scope, windowMs, max, message] of limited) {
    if (!(await consumeRateLimit(scope, windowMs, max))) {
      return NextResponse.json({ error: message }, { status: 429 })
    }
  }

  // 11. Store. A nameless visitor gets an Anonymous_ name server-side
  //     (never trust the client to pick one). Replies go through
  //     createReply, which atomically re-verifies the parent (step 7)
  //     so a parent deleted mid-submit can't orphan a reply.
  const comment =
    parentId != null
      ? await createReply({
          postSlug: body.postSlug,
          // zod already trimmed authorName; empty/undefined → anonymous.
          authorName: body.authorName || anonymousName(),
          authorEmail: body.authorEmail ?? "",
          content: body.content,
          ipHash,
          parentId,
        })
      : await createComment({
          postSlug: body.postSlug,
          authorName: body.authorName || anonymousName(),
          authorEmail: body.authorEmail ?? "",
          content: body.content,
          ipHash,
          parentId: null,
        })
  if (!comment) {
    // The parent disappeared between the pre-check and the insert.
    return NextResponse.json(
      { error: "Invalid reply target", code: "invalid_parent" },
      { status: 400 }
    )
  }
  return NextResponse.json(
    {
      comment: {
        id: comment.id,
        postSlug: comment.postSlug,
        authorName: comment.authorName,
        content: comment.content,
        parentId: comment.parentId,
        createdAt: comment.createdAt,
      } satisfies PublicComment,
    },
    { status: 201 }
  )
}
