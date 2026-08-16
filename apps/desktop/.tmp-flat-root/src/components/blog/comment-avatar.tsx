import { Avatar, AvatarFallback } from "@/components/ui/avatar"

// Deterministic avatar color per comment id: the palette slot is
// id % length, so one comment always renders with the same color while
// different comments spread across the palette. Shades are Tailwind
// 700-levels so white initials keep readable contrast.
const AVATAR_COLORS = [
  "#b91c1c", // red-700
  "#c2410c", // orange-700
  "#a16207", // amber-700
  "#15803d", // green-700
  "#0f766e", // teal-700
  "#1d4ed8", // blue-700
  "#4338ca", // indigo-700
  "#6d28d9", // violet-700
  "#be185d", // pink-700
  "#0e7490", // cyan-700
]

/** Initial-letter avatar, shared by the article comment cards (sm) and
 *  the admin inbox (default). Decorative (aria-hidden); the initial
 *  comes from the rendered display name. Same comment id always gets
 *  the same palette color. Built on the shared Avatar primitive so the
 *  ring treatment and sizing stay consistent with the site's avatars. */
export function CommentAvatar({
  commentId,
  name,
  size = "sm",
}: {
  commentId: number
  name: string
  size?: "sm" | "default"
}) {
  return (
    <Avatar size={size} aria-hidden>
      {/* Font size comes from the primitive's size variants (text-xs at
          sm, text-sm at default) — a plain text-xs override would lose
          to the base text-sm in the cascade. */}
      <AvatarFallback
        className="font-semibold text-white"
        style={{ backgroundColor: AVATAR_COLORS[commentId % AVATAR_COLORS.length] }}
      >
        {Array.from(name)[0] ?? ""}
      </AvatarFallback>
    </Avatar>
  )
}
