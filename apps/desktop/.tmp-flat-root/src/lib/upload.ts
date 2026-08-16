import { apiFetch } from "@/lib/api-client"
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT,
  UPLOAD_TIMEOUT_MS,
} from "@/lib/upload-constants"

export {
  MAX_UPLOAD_BYTES,
  UPLOAD_TIMEOUT_MS,
  UPLOAD_ACCEPT,
  isUploadableImage,
} from "@/lib/upload-constants"

type UploadResult =
  | { ok: true; url: string; name?: string }
  | {
      ok: false
      /** Discriminator for i18n — never put localized copy in the helper. */
      reason: "network" | "failed"
      /** Server-provided message when present; callers fall back to i18n. */
      message?: string
      status?: number
    }

/** POST a single image to /api/upload with the shared timeout. */
export async function uploadImageFile(file: File): Promise<UploadResult> {
  const body = new FormData()
  body.append("file", file)
  try {
    const res = await apiFetch("/api/upload", {
      method: "POST",
      body,
      timeout: UPLOAD_TIMEOUT_MS,
    })
    const data = (await res.json().catch(() => ({}))) as {
      url?: string
      /** The route returns the stored media filename, not "name". */
      filename?: string
      error?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        reason: "failed",
        message: data.error,
        status: res.status,
      }
    }
    if (!data.url) {
      return { ok: false, reason: "failed", status: res.status }
    }
    return { ok: true, url: data.url, name: data.filename }
  } catch {
    return { ok: false, reason: "network" }
  }
}

/** Pre-flight check used by batch upload UIs before hitting the network.
 *  Mirrors the server's ALLOWED_TYPES exactly — a startsWith("image/")
 *  check would let AVIF/BMP/TIFF through preflight only to get a raw
 *  English 400 from the server instead of the localized toast. */
export function validateImageFile(file: File): "ok" | "type" | "size" {
  if (!UPLOAD_ACCEPT.split(",").includes(file.type)) return "type"
  if (file.size > MAX_UPLOAD_BYTES) return "size"
  return "ok"
}
