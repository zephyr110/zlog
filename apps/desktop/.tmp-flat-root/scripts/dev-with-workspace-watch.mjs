// `pnpm dev:watch` — next dev that also tracks the @zlog/* workspace
// packages.
//
// Why: Turbopack's file watcher does not reliably watch pnpm-symlinked
// workspace packages (verified: edits to packages/database/src are never
// picked up until the dev server restarts; the same file in apps/web
// hot-reloads fine). This script watches the workspace sources and
// restarts `next dev` when they change — a few seconds instead of an
// unnoticed stale server.
//
// Use `pnpm dev` if you never touch the packages/ code.

import { spawn } from "node:child_process"
import { readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url)) // apps/web/scripts
const webDir = path.dirname(scriptDir) // apps/web
const rootDir = path.resolve(webDir, "../..") // monorepo root

const WATCH_DIRS = [
  "packages/database/src",
  "packages/core/src",
  "packages/auth/src",
].map((p) => path.join(rootDir, p))

const RESTART_DEBOUNCE_MS = 300
const PORT_RELEASE_WAIT_MS = 1000
// mtime polling — fs.watch({recursive}) drops events on macOS (FSEvents);
// polling the small workspace tree every second is cheap and reliable.
const POLL_MS = 1000

let child = null
let restartTimer = null
let stopping = false

function startDev() {
  console.log("── next dev (port 3000) ─────────────────────────────")
  child = spawn("pnpm", ["exec", "next", "dev", "-p", "3000"], {
    cwd: webDir,
    stdio: "inherit",
    env: { ...process.env },
  })
  child.on("exit", (code, signal) => {
    child = null
    if (!stopping && code !== 0 && signal !== "SIGTERM") {
      console.log(`next dev exited (${code}) — exiting.`)
      process.exit(code ?? 1)
    }
  })
}

function scheduleRestart() {
  if (stopping) return
  clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    if (!child) return
    console.log("\n── workspace package changed — restarting dev server ──")
    stopping = true
    child.kill("SIGTERM")
    setTimeout(() => {
      stopping = false
      startDev()
    }, PORT_RELEASE_WAIT_MS)
  }, RESTART_DEBOUNCE_MS)
}

function collectFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(p, out)
    else if (entry.isFile() && /\.(ts|tsx|mts)$/.test(p)) out.push(p)
  }
  return out
}

function snapshot() {
  const map = new Map()
  for (const dir of WATCH_DIRS) {
    for (const file of collectFiles(dir)) {
      try {
        map.set(file, statSync(file).mtimeMs)
      } catch {
        // file vanished mid-scan — will show up as a delete next round
      }
    }
  }
  return map
}

let lastSnapshot = snapshot()
for (const dir of WATCH_DIRS) {
  console.log(`watching ${path.relative(rootDir, dir)}`)
}

setInterval(() => {
  const next = snapshot()
  let changed = next.size !== lastSnapshot.size
  if (!changed) {
    for (const [file, mtime] of next) {
      if (lastSnapshot.get(file) !== mtime) {
        changed = true
        break
      }
    }
  }
  lastSnapshot = next
  if (changed) scheduleRestart()
}, POLL_MS)

process.on("SIGINT", () => {
  stopping = true
  child?.kill("SIGTERM")
  process.exit(0)
})

startDev()
