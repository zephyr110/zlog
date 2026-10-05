import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { moveProject } from "@zlog/database"
import { requireAuth } from "@/lib/api-auth"

const moveSchema = z.object({ direction: z.enum(["up", "down"]) })

/** Auth — reorder. A no-op at the first/last position returns moved: false. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id: rawId } = await params
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }
  const parsed = moveSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid direction" }, { status: 400 })
  }
  const moved = await moveProject(id, parsed.data.direction)
  if (moved) revalidatePath("/projects")
  return NextResponse.json({ ok: true, moved })
}
