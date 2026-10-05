import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { listProjects, createProject } from "@zlog/database"
import { requireAuth } from "@/lib/api-auth"
import { optionalHttpUrl } from "@/lib/url-validation"

const createSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  repoUrl: optionalHttpUrl.optional(),
  demoUrl: optionalHttpUrl.optional(),
  cover: optionalHttpUrl.optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
  visible: z.boolean().optional(),
})

/** Auth — full list, including hidden projects. */
export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ projects: await listProjects() })
}

/** Auth — create. */
export async function POST(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    )
  }
  const data = parsed.data
  const project = await createProject({
    title: data.title,
    description: data.description ?? "",
    repoUrl: data.repoUrl ?? "",
    demoUrl: data.demoUrl ?? "",
    cover: data.cover ?? "",
    tags: data.tags ?? [],
    visible: data.visible ?? true,
  })
  revalidatePath("/projects")
  return NextResponse.json({ project })
}
