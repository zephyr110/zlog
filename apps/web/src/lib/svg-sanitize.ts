/**
 * Upload-time SVG danger check.
 *
 * SVGs are served same-origin (/api/media/[name]) and browsers execute
 * scripts inside them when the file is opened as a top-level document —
 * unlike <img> embedding, where scripts are inert. Defense in depth:
 *  1. this check rejects obvious script/event-handler payloads at upload;
 *  2. the media route adds `Content-Security-Policy: sandbox`, so even a
 *     surviving SVG runs as an opaque origin with scripts disabled.
 *
 * This is a payload blocklist, not a full sanitizer. Before matching it
 * strips comments/CDATA (so harmless literal mentions of "<script>" in
 * text don't false-positive) and decodes numeric character references
 * (so `java&#x73;cript:` doesn't slip past the literal patterns — SVG is
 * XML, where only the 5 predefined named entities and numeric refs
 * exist, and the browser decodes numeric refs before URL handling).
 */

const DANGEROUS_PATTERNS: RegExp[] = [
  /<script\b/i,
  // foreignObject embeds HTML — a script inside it executes in some
  // browsers even when the SVG itself has no <script>.
  /<foreignObject\b/i,
  /<object\b/i,
  /<embed\b/i,
  /<iframe\b/i,
  // Event-handler attributes (onload/onclick/onerror/...). Require a
  // quoted value — SVG is XML so real handlers are always quoted, and a
  // bare "onload=" mention in text content can never execute.
  /\bon[a-z]+\s*=\s*["']/i,
  // javascript:/vbscript: URLs. Only flagged inside a quoted attribute
  // value — SVG is XML so attribute values are always quoted, and a
  // plain mention of "javascript:" in text content is harmless (it can
  // never execute).
  /["']\s*java\s*script\s*:/i,
  /["']\s*vb\s*script\s*:/i,
  // External references from <use>/<image> — these can beacon to an
  // attacker's server when the SVG is opened as a document. Allowed:
  // "#fragment" refs (internal reuse), "data:" URLs (rendered as an
  // inert image), and empty values. <a href> links are deliberately
  // allowed: they're inert under the sandbox header and in <img> context.
  /<(?:use|image)\b[^>]*\b(?:xlink:)?href\s*=\s*["'](?!\s*(?:#|data:))[^"']/i,
]

/**
 * CSS inside <style> can still load external resources (@import,
 * url(https://…)) when the SVG is opened as a top-level document — a
 * beacon channel even under the sandbox header. Inline/data: URLs are
 * fine; external ones are not.
 */
const STYLE_EXTERNAL_RE =
  /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi
const STYLE_EXTERNAL_URL_RE = /@import\b|\burl\s*\(\s*["']?\s*https?:\/\//i

/** Decode XML numeric character references so the patterns above see
 *  what the browser's parser will see. */
function decodeXmlCharRefs(s: string): string {
  return s.replace(
    /&#(x[0-9a-f]+|\d+);/gi,
    (_, hex: string) => {
      const codePoint = hex[0].toLowerCase() === "x"
        ? parseInt(hex.slice(1), 16)
        : parseInt(hex, 10)
      // Only decode refs that map to real Unicode scalars; anything
      // invalid stays literal (browser rejects it anyway).
      if (
        !Number.isFinite(codePoint) ||
        codePoint <= 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return ""
      }
      return String.fromCodePoint(codePoint)
    }
  )
}

export function hasDangerousSvgContent(svg: string): boolean {
  const body = decodeXmlCharRefs(
    svg
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
  )
  if (DANGEROUS_PATTERNS.some((re) => re.test(body))) return true

  // <style> external resource loads — scanned separately so inline
  // styles (the common case) cost nothing beyond one pass.
  for (const match of body.matchAll(STYLE_EXTERNAL_RE)) {
    if (STYLE_EXTERNAL_URL_RE.test(match[1])) return true
  }
  return false
}
