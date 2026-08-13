import { spawnSync } from "node:child_process"
import { cpSync, existsSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const desktopDir = join(here, "..")
const repoRoot = join(desktopDir, "..", "..")
const webDir = join(repoRoot, "apps", "web")
// 嵌套路径（Task 1 spike 结论）：trace root 为 workspace 根
const standaloneAppDir = join(webDir, ".next", "standalone", "apps", "web")

// 1) 以 NEXT_DESKTOP=true 构建 web（spawn env 方式，跨平台安全）
const res = spawnSync("pnpm", ["--filter", "@zlog/web", "build"], {
  cwd: repoRoot,
  env: { ...process.env, NEXT_DESKTOP: "true" }, // 必须与 next.config 的 === "true" 判断一致（Task 2 修正）
  stdio: "inherit",
})
if (res.status !== 0) process.exit(res.status ?? 1)

// 2) 按 standalone 契约补齐 .next/static 与 public（拷入嵌套的 app 目录）
cpSync(join(webDir, ".next", "static"), join(standaloneAppDir, ".next", "static"), {
  recursive: true,
})
if (existsSync(join(webDir, "public"))) {
  cpSync(join(webDir, "public"), join(standaloneAppDir, "public"), { recursive: true })
}

// 3) 确认 server.js 存在
if (!existsSync(join(standaloneAppDir, "server.js"))) {
  console.error("standalone server.js missing — build failed?")
  process.exit(1)
}
console.log("standalone ready:", standaloneAppDir)
