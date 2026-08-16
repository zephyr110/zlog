import sharp from "sharp"

interface CompressedImage {
  buffer: Buffer
  mime: string
  ext: string
}

/** Longest edge cap — prevents huge source images from blowing up
 *  serverless memory and repo size. */
const MAX_EDGE = 4096

/** Quality from BLOG_IMG_QUALITY (default 80), clamped to [1, 100]. */
function imageCompressQuality(): number {
  const parsed = parseInt(process.env.BLOG_IMG_QUALITY ?? "", 10)
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 80
}

function extForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg"
    case "image/png":
      return ".png"
    case "image/gif":
      return ".gif"
    case "image/webp":
      return ".webp"
    case "image/svg+xml":
      return ".svg"
    default:
      throw new Error(`Unsupported image type: ${mime}`)
  }
}

/**
 * Compresses an uploaded image in memory:
 * - jpeg/png → webp (png uses lossless — screenshots must stay pixel-perfect)
 * - animated gif / webp / svg → returned as-is
 * Falls back to the original buffer when compression does not help.
 */
export async function compressImage(
  buffer: Buffer,
  mime: string
): Promise<CompressedImage> {
  const ext = extForMime(mime)

  if (ext === ".gif") {
    const meta = await sharp(buffer, { animated: true }).metadata()
    // sharp only decodes the first frame of animated gifs — keep them untouched.
    if ((meta.pages ?? 1) > 1) return { buffer, mime, ext }
  }
  if (ext === ".svg" || ext === ".webp") {
    return { buffer, mime, ext }
  }

  const quality = imageCompressQuality()
  const pipeline = sharp(buffer).rotate().resize({
    width: MAX_EDGE,
    height: MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  })
  const webpBuffer =
    ext === ".png"
      ? await pipeline.webp({ lossless: true }).toBuffer()
      : await pipeline.webp({ quality }).toBuffer()

  if (webpBuffer.length >= buffer.length) {
    return { buffer, mime, ext }
  }
  return { buffer: webpBuffer, mime: "image/webp", ext: ".webp" }
}
