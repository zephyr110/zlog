// Check zh/en translation key symmetry in src/lib/i18n.
//
// A key missing from one locale silently degrades to the literal path
// string (getTranslation's fallback), and components that CALL t() as a
// function (PostCard's minRead, comment strings) then throw
// "x is not a function" — this is how the en dictionary loss in 531f46e
// crashed every page with a PostCard on language switch. This check
// fails the build before that can ship again.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const dir = join(import.meta.dirname, "../src/lib/i18n")
let failed = false

for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
  const lines = readFileSync(join(dir, f), "utf8").split("\n")
  let block = null
  const zh = []
  const en = []

  for (const line of lines) {
    // Dictionary blocks: `const zh = {` … `} as const` and
    // `const en = {` … `} as const satisfies LocaleMessages<typeof zh>`.
    // (Values' continuation lines use other indentation/colons.)
    if (line === "const zh = {") {
      block = "zh"
      continue
    }
    if (line === "const en = {") {
      block = "en"
      continue
    }
    if (line.startsWith("} as const")) {
      block = null
      continue
    }
    if (block) {
      // Keys sit at 0–2 spaces (the dicts mix both); multi-line values'
      // continuation lines (e.g. shortDate's "  d.toLocaleDateString"
      // or 4-space option keys) never match — no colon after the name.
      const m = line.match(/^ {0,2}([a-zA-Z][a-zA-Z0-9]*):/)
      if (m) (block === "zh" ? zh : en).push(m[1])
    }
  }

  const missing = zh.filter((k) => !en.includes(k))
  const extra = en.filter((k) => !zh.includes(k))
  if (missing.length || extra.length) {
    failed = true
    console.error(`\n✖ ${f}: zh=${zh.length} en=${en.length}`)
    if (missing.length) console.error(`  missing in en: ${missing.join(", ")}`)
    if (extra.length) console.error(`  en-only: ${extra.join(", ")}`)
  } else {
    console.log(`✓ ${f}: ${zh.length} keys, symmetric`)
  }
}

if (failed) {
  console.error(
    "\ni18n dictionaries are asymmetric — a missing key degrades to the literal " +
      "path string at runtime and crashes components that call t() as a function."
  )
  process.exit(1)
}
console.log("\nAll i18n dictionaries symmetric ✓")
