/** Sanitize a slug: lowercase, strip path traversal, keep only safe chars. */
export function safeSlug(slug: string): string {
  if (!slug.trim()) return `untitled-${Date.now()}`
  return (
    slug
      .toLowerCase()
      .replace(/\.\./g, "")
      .replace(/[\/\\]/g, "-")
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 100) || `untitled-${Date.now()}`
  )
}

/** Generate a slug from a title with non-ASCII fallback */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80)
  return slug || `post-${Date.now()}`
}
