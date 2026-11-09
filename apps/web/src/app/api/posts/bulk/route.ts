import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth } from "@/lib/api-auth"
import { movePost, setPostVisible } from "@zlog/database"

const bulkSchema = z.object({
  slugs: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["hide", "show", "draft"]),
})

// PATCH /api/posts/bulk — hide / show / move-to-draft many posts at once.
// One request also means one revalidation: a whole page of toggles would
// otherwise invalidate the public cache once per post.
export async function PATCH(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parseResult = bulkSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    )
  }

  const { action } = parseResult.data
  const slugs = Array.from(new Set(parseResult.data.slugs))

  const updated: string[] = []
  const missing: string[] = []
  const failed: string[] = []

  // Settle each post independently: one bad slug must not abandon the
  // rest of the batch, and the client needs the split for its toast.
  for (const slug of slugs) {
    try {
      const post =
        action === "draft"
          ? await movePost(slug, true)
          : await setPostVisible(slug, action === "show")
      if (post) updated.push(slug)
      else missing.push(slug)
    } catch {
      failed.push(slug)
    }
  }

  if (updated.length > 0) revalidatePath("/", "layout")

  return NextResponse.json({ updated, missing, failed })
}
