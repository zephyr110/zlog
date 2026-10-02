import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  renameSync,
  rmSync,
  existsSync,
} from "fs"
import { resolve, dirname, relative, sep } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")
const appDir = resolve(root, "src/app")

const HEADER = 'export const dynamic = "force-static"\n'
/** Top-level declaration used by the server-only route handlers (auth,
 *  per-request data). */
const FORCE_DYNAMIC_RE = /^export const dynamic = "force-dynamic"/m
/** Where force-dynamic routes are parked for the duration of the export
 *  build (mirrors the src/app tree; gitignored). */
const STASH_DIR = resolve(__dirname, ".export-stash")

/** Recursively find all route.ts/route.tsx files under dir */
function findRoutes(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fp = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findRoutes(fp))
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      results.push(fp)
    }
  }
  return results
}

/** Export-incompatible routes, parked for the duration of the build:
 *  - routes declaring their own `force-dynamic`: the prepended
 *    force-static would be a duplicate `dynamic` export (SyntaxError),
 *    and Next rejects a lone force-dynamic under output: export.
 *  - API routes with dynamic segments: Next 16 refuses to export them
 *    even when the file defines generateStaticParams (verified —
 *    /api/media/[name] errored "missing generateStaticParams()" with the
 *    function present), so they cannot exist in a static build. The
 *    export site serves media over jsdelivr instead. */
function stashReason(file) {
  if (FORCE_DYNAMIC_RE.test(readFileSync(file, "utf-8"))) return "force-dynamic"
  const rel = relative(appDir, file)
  if (rel.split(sep)[0] === "api" && rel.includes("[")) return "dynamic segment"
  return null
}

function stashRoutes(routes) {
  for (const file of routes) {
    const reason = stashReason(file)
    if (!reason) continue
    const dest = resolve(STASH_DIR, relative(appDir, file))
    mkdirSync(dirname(dest), { recursive: true })
    renameSync(file, dest)
    console.log(`Stashed (${reason}): ${file}`)
  }
}

/** Put every stashed file back under src/app and drop the stash dir. */
function restoreStash() {
  if (!existsSync(STASH_DIR)) return
  for (const file of findRoutes(STASH_DIR)) {
    const dest = resolve(appDir, relative(STASH_DIR, file))
    renameSync(file, dest)
    console.log(`Restored: ${dest}`)
  }
  rmSync(STASH_DIR, { recursive: true, force: true })
}

// The export script chains `add && next build && remove`, so a failed
// build skips `remove` and leaves files stashed — recover them first so
// every run starts from the real tree.
restoreStash()

const action = process.argv[2] // "add" or "remove"
const routes = findRoutes(appDir)

if (action === "add") {
  stashRoutes(routes)
  for (const file of routes) {
    if (!existsSync(file)) continue // just stashed
    const content = readFileSync(file, "utf-8")
    if (!content.startsWith(HEADER)) {
      writeFileSync(file, HEADER + content)
      console.log(`Added force-static: ${file}`)
    }
  }
} else if (action === "remove") {
  for (const file of routes) {
    const content = readFileSync(file, "utf-8")
    if (content.startsWith(HEADER)) {
      writeFileSync(file, content.slice(HEADER.length))
      console.log(`Removed force-static: ${file}`)
    }
  }
  restoreStash()
} else {
  console.error(`Unknown action: ${action} — expected "add" or "remove"`)
  process.exit(1)
}
