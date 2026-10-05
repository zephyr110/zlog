import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { updateProject, deleteProject } from "@zlog/database"
import { requireAuth } from "@/lib/api-auth"
import { optionalHttpUrl } from "@/lib/url-validation"

const updateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(200).optional(),
  repoUrl: optionalHttpUrl.optional(),
  demoUrl: optionalHttpUrl.optional(),
  cover: optionalHttpUrl.optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
  visible: z.boolean().optional(),
})

function parseId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Auth — partial update (fields + visibility). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id: rawId } = await params
  const id = parseId(rawId)
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }
  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    )
  }
  const project = await updateProject(id, parsed.data)
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  revalidatePath("/projects")
  return NextResponse.json({ project })
}

/** Auth — delete. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id: rawId } = await params
  const id = parseId(rawId)
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }
  const removed = await deleteProject(id)
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  revalidatePath("/projects")
  return NextResponse.json({ ok: true })
}
