/**
 * Paths that belong in the public Top pages list. Admin CMS routes are
 * owner-only noise (dashboard, editor, media library) and must not crowd
 * out real visitor destinations.
 */
export function isPublicTrafficPath(path: string): boolean {
  const p = path.trim()
  if (!p || p === "Others" || p === "(not set)") return false
  if (p === "/admin" || p.startsWith("/admin/")) return false
  return true
}
