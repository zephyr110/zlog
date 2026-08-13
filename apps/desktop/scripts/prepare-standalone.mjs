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

// 1) 注入 force-dynamic（构建期查库的页面必须动态渲染，否则烧入构建机数据：
//    本地构建=生产快照，CI 构建=空首页/构建失败。Task 11b）
const toggle = join(webDir, "scripts", "toggle-force-dynamic.mjs")
const toggleAdd = () =>
  spawnSync(process.execPath, [toggle, "add"], { cwd: webDir, stdio: "inherit" }).status
const toggleRemove = () =>
  spawnSync(process.execPath, [toggle, "remove"], { cwd: webDir, stdio: "inherit" }).status

// 注意：process.exit() 不会执行 finally（不展开调用栈），
// 故失败路径也走 finally 统一收集退出码，保证注入必定被移除。
let exitCode = 0
try {
  if (toggleAdd() !== 0) {
    exitCode = 1
  } else {
    const res = spawnSync("pnpm", ["--filter", "@zlog/web", "build"], {
      cwd: repoRoot,
      env: { ...process.env, NEXT_DESKTOP: "true" }, // 必须与 next.config 的 === "true" 判断一致（Task 2 修正）
      stdio: "inherit",
    })
    if (res.status !== 0) exitCode = res.status ?? 1
  }
} finally {
  // 构建失败也要移除注入，否则污染工作树并破坏后续 export 构建
  if (toggleRemove() !== 0) exitCode = exitCode || 1
}
// 仅在失败时提前退出；成功则继续走 standalone 组装（cpSync static/public）
if (exitCode !== 0) process.exit(exitCode)

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
