import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import {
  insertMedia,
  setMediaSha,
  listMedia,
  countMedia,
  deleteMedia,
} from "@zlog/database"
import { cdnUrl } from "@/lib/github-image"
import { MAX_UPLOAD_BYTES } from "@/lib/upload-constants"
import path from "path"

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]

// Magic numbers for the most common image formats.
const MAGIC_NUMBERS: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/gif": [0x47, 0x49, 0x46],
  "image/webp": [0x52, 0x49, 0x46],
}

function hasValidMagicBytes(buffer: Buffer, type: string): boolean {
  const signature = MAGIC_NUMBERS[type]
  if (!signature) return true // SVG is checked separately
  return signature.every((byte, i) => buffer[i] === byte)
}

function looksLikeSvg(buffer: Buffer): boolean {
  const snippet = buffer.slice(0, 256).toString("utf-8").trim().toLowerCase()
  return snippet.startsWith("<?xml") || snippet.startsWith("<svg")
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9.-]/g, "_")
  const ext = path.extname(base).toLowerCase()
  const stem = path.basename(base, ext)
  // Reject double extensions / anything suspicious.
  const cleanExt = ALLOWED_EXTENSIONS.includes(ext) ? ext : ".bin"
  return `${stem.slice(0, 50)}${cleanExt}`
}

export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Pagination: page is 1-based, pageSize clamped to [1, 100] (default 20,
  // matching the pagination bar's smallest option).
  const rawPage = Number(request.nextUrl.searchParams.get("page") ?? "1")
  const rawSize = Number(request.nextUrl.searchParams.get("pageSize") ?? "20")
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1
  const pageSize =
    Number.isInteger(rawSize) && rawSize >= 1 && rawSize <= 100 ? rawSize : 20

  // Date filter: UTC timestamps ("YYYY-MM-DD" is expanded to the full
  // day). The client converts its local-day window to exact UTC timestamps
  // so display and filtering agree regardless of timezone.
  const params = request.nextUrl.searchParams
  const fromParam = params.get("from") ?? undefined
  const toParam = params.get("to") ?? undefined
  const DAY = /^\d{4}-\d{2}-\d{2}$/
  const TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
  const from = fromParam
    ? DAY.test(fromParam)
      ? `${fromParam} 00:00:00`
      : TS.test(fromParam)
        ? fromParam
        : undefined
    : undefined
  const to = toParam
    ? DAY.test(toParam)
      ? `${toParam} 23:59:59`
      : TS.test(toParam)
        ? toParam
        : undefined
    : undefined
  // Filename search: case-insensitive substring, trimmed.
  const q = params.get("q")?.trim() || undefined
  const filter = from || to || q ? { from, to, q } : undefined

  try {
    const [records, total] = await Promise.all([
      listMedia(pageSize, (page - 1) * pageSize, filter),
      countMedia(filter),
    ])
    return NextResponse.json({
      images: records.map((record) => ({
        name: record.name,
        // githubSha null = Turso-only（GitHub 投递不可用时的降级上传）——
        // 用 /api/media/[name] 兜底出图，而不是指向 jsdelivr 的 404
        url: record.githubSha ? cdnUrl(record.name) : `/api/media/${record.name}`,
        createdAt: record.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (error) {
    // A 200-with-empty-array here would make the client's `!res.ok`
    // apiError check unreachable — a DB outage would render as a silent
    // empty library. Surface the failure so the admin sees the error
    // state instead of a dead-feeling empty grid.
    console.error("List media error:", error)
    return NextResponse.json(
      { images: [], total: 0, page, pageSize, totalPages: 1 },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type" },
        { status: 400 }
      )
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "File too large" },
        { status: 400 }
      )
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "Empty file" },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Validate file content, not just MIME type.
    if (file.type === "image/svg+xml") {
      if (!looksLikeSvg(buffer)) {
        return NextResponse.json(
          { error: "Invalid SVG content" },
          { status: 400 }
        )
      }
    } else if (!hasValidMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: "File content does not match its extension" },
        { status: 400 }
      )
    }

    // Compress in memory (jpeg/png → webp; animated gif / svg untouched).
    // sharp ships a native binary that can be unavailable on serverless
    // runtimes (Vercel) — if it fails to load, upload the ORIGINAL bytes
    // instead of failing the whole upload. Compression is an optimization,
    // not a requirement.
    let optimized: Buffer = buffer
    let mime = file.type
    let ext = path.extname(sanitizeFilename(file.name)).toLowerCase() || ".bin"
    try {
      const { compressImage } = await import("@/lib/image-compress")
      const result = await compressImage(buffer, file.type)
      optimized = result.buffer
      mime = result.mime
      ext = result.ext
    } catch (error) {
      console.warn(
        "Image compression unavailable — uploading original:",
        error
      )
    }

    const timestamp = Date.now()
    const safeName = sanitizeFilename(file.name)
    const stem = safeName.slice(0, safeName.lastIndexOf("."))
    const filename = `${timestamp}-${stem}${ext}`

    // ① Turso is the authoritative store — write it first.
    try {
      await insertMedia({
        filename,
        contentType: mime,
        size: optimized.length,
        data: new Uint8Array(optimized),
      })
    } catch (error) {
      console.error("Database write failed:", error)
      return NextResponse.json(
        { error: "Database write failed" },
        { status: 500 }
      )
    }

    // ② GitHub is the delivery layer (jsdelivr CDN). When it's unavailable —
    //    e.g. Vercel deploys without BLOG_IMG_GITHUB_TOKEN — degrade
    //    gracefully instead of failing the upload: Turso is the
    //    authoritative store and /api/media/[name] serves the bytes
    //    directly. A failed push does NOT roll back the DB row; the image
    //    remains fully functional, just without the CDN front.
    let delivery = false
    try {
      const { uploadToGithub } = await import("@/lib/github-image")
      const { sha } = await uploadToGithub(filename, optimized)
      // Best-effort sha backfill: if this fails, deletes still work via the
      // Contents API lookup fallback in deleteFromGithub.
      await setMediaSha(filename, sha).catch((error) => {
        console.error("Failed to backfill github_sha:", error)
      })
      delivery = true
    } catch (error) {
      console.warn(
        "GitHub upload unavailable — serving from Turso (/api/media):",
        error
      )
    }

    if (delivery) {
      // ③ Warm the jsdelivr cache (best-effort, non-blocking). New files are
      //    usually reachable within a couple of minutes either way.
      void fetch(cdnUrl(filename), { method: "HEAD" }).catch(() => {})
    }

    return NextResponse.json(
      {
        url: delivery ? cdnUrl(filename) : `/api/media/${filename}`,
        filename,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Upload error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: process.env.NODE_ENV === "development" ? message : "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Dynamic import — deleteFromGithub is only needed for DELETE requests.
    const { deleteFromGithub } = await import("@/lib/github-image")
    const user = await requireAuth(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const filename = request.nextUrl.searchParams.get("filename")
    if (!filename) {
      return NextResponse.json(
        { error: "Missing filename" },
        { status: 400 }
      )
    }

    // Plain filename only — white-listed extension, no path segments.
    const ext = path.extname(filename).toLowerCase()
    if (
      !ALLOWED_EXTENSIONS.includes(ext) ||
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.startsWith(".")
    ) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 })
    }

    // Remove from Turso first (returns the row so we can roll back).
    const record = await deleteMedia(filename)
    if (!record) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Then remove from GitHub; a 404 there is already-gone (idempotent).
    // githubSha null = Turso-only 降级上传（从未推送）——直接跳过 GitHub。
    if (record.githubSha === null) {
      return NextResponse.json({ success: true })
    }
    try {
      await deleteFromGithub(filename, record.githubSha)
    } catch (error) {
      console.error("GitHub delete failed:", error)
      await insertMedia({
        filename: record.filename,
        contentType: record.contentType,
        size: record.size,
        data: record.data,
        githubSha: record.githubSha,
      }).catch(() => {})
      return NextResponse.json(
        { error: "GitHub delete failed" },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
