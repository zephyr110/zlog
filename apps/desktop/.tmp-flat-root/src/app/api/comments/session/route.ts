import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { signCommentSession } from "@/lib/comment-session"
import { getClientIp, hashIp } from "@/lib/comment-ip"

const sessionQuery = z.object({
  post: z.string().min(1).max(100),
})

/** Issue a signed, post-bound session token for the comment form.
 *  Stateless (HMAC), so this endpoint can be called freely — a token
 *  expires in 5 minutes and is bound to the visitor's IP + post. */
export async function GET(request: NextRequest) {
  const parsed = sessionQuery.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  )
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid post slug" }, { status: 400 })
  }

  const token = await signCommentSession({
    postSlug: parsed.data.post,
    ipHash: hashIp(getClientIp(request)),
    issuedAt: Date.now(),
  })
  if (!token) {
    // Production without SESSION_SECRET — never mint forgeable tokens.
    return NextResponse.json({ error: "Comments not configured" }, { status: 503 })
  }
  return NextResponse.json({ token })
}
