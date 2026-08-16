/** Upload limits shared by /api/upload and every admin upload UI. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5MB

/** Client timeout for uploads (compression + optional GitHub push). */
export const UPLOAD_TIMEOUT_MS = 120_000

export const UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/svg+xml"

export function isUploadableImage(file: File): boolean {
  return file.type.startsWith("image/") && file.size <= MAX_UPLOAD_BYTES
}
