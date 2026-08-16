import { readFileSync, writeFileSync, readdirSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")

const HEADER = 'export const dynamic = "force-static"\n'

/** Recursively find all route.ts/route.tsx files under src/app */
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

const action = process.argv[2] // "add" or "remove"
const routes = findRoutes(resolve(root, "src/app"))

for (const file of routes) {
  let content = readFileSync(file, "utf-8")
  if (action === "add" && !content.startsWith(HEADER)) {
    writeFileSync(file, HEADER + content)
    console.log(`Added force-static: ${file}`)
  } else if (action === "remove" && content.startsWith(HEADER)) {
    writeFileSync(file, content.slice(HEADER.length))
    console.log(`Removed force-static: ${file}`)
  }
}
