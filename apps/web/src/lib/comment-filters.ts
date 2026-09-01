/**
 * Server-side comment content sanity checks (cheap string tests, no DB,
 * no network) — used by POST /api/comments before the paid checks
 * (Turnstile, rate limits). Extracted from the route so they're unit
 * testable.
 */

/** Common file extensions that must not read as a bare "domain" —
 *  "package.json" or "README.md" in a code discussion isn't link spam. */
const FILE_EXTENSIONS =
  "json|js|ts|tsx|jsx|mjs|cjs|md|markdown|txt|html?|css|scss|sass|" +
  "xml|ya?ml|toml|ini|cfg|conf|env|log|lock|map|py|rb|go|rs|java|c|cpp|h|" +
  "sh|bat|ps1|sql|svg|png|jpe?g|gif|webp|ico|pdf|zip|tar|gz|7z|rar|exe|dmg|" +
  "pkg|apk|ipa|deb|rpm|iso|bin|bak|tmp|swp"

/** Bare domain.tld token, preceded by a boundary that isn't @/word/dot
 *  (so emails and path segments don't match) and whose TLD isn't a file
 *  extension (see FILE_EXTENSIONS). */
const BARE_DOMAIN_RE = new RegExp(
  `(?<![@\\w.-])\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?!(?:${FILE_EXTENSIONS})\\b)[a-z]{2,}\\b`,
  "gi"
)

/** Max 2 URLs per comment — link spam is the bulk of automated abuse.
 *  Counts full URLs (scheme or www. prefix) and bare domains, each
 *  exactly once — a "www.example.com" URL must not count twice, and
 *  email domains or file extensions (package.json, README.md) must not
 *  count. */
export function countUrls(content: string): number {
  const full = (content.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || []).length
  // After removing full URLs, count bare domain.tld tokens.
  const rest = content.replace(/(?:https?:\/\/|www\.)[^\s<>"']+/gi, " ")
  const bare = (rest.match(BARE_DOMAIN_RE) || []).length
  return full + bare
}

/** A comment made of one repeated character/short loop (aaaa…, 66666…,
 *  lkjhggfd…) is noise. Flag when the distinct-character set is tiny.
 *  Short comments (< 8 chars) are exempt — "哈哈哈", "666", "kkk" are
 *  legitimate human reactions and would otherwise all be rejected. */
export function isRepetitiveNoise(content: string): boolean {
  if (content.length < 8) return false
  const distinct = new Set(content.replace(/\s/g, "")).size
  return distinct < Math.max(2, Math.floor(content.length * 0.2))
}
