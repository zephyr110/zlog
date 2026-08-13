import { readFileSync, writeFileSync, readdirSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")

const HEADER = 'export const dynamic = "force-dynamic"\n'
const CLIENT_DIRECTIVE = '"use client"'

/** 递归查找 src/app 下所有 page.tsx/page.jsx（构建期查库的页面需要动态渲染） */
function findPages(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fp = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findPages(fp))
    } else if (entry.name === "page.tsx" || entry.name === "page.jsx") {
      results.push(fp)
    }
  }
  return results
}

// 构建期查库/被静态求值烤死的非 page 文件（Task 12 CI 实测发现）。
// 注意：force-dynamic 不会跳过 generateStaticParams 与静态 GET 求值之外的
// 产物差异 —— 这里逐个枚举的是“构建期会真正执行 DB 调用”的文件；
// 若新增的 GET handler 不带 request 参数，就会在构建期被静态求值，必须加入。
const BUILD_TIME_DB_TARGETS = [
  // 静态 GET 求值会查库（sitemap/feed/site-settings）
  "src/app/sitemap.xml/route.ts",
  "src/app/feed.xml/route.ts",
  "src/app/api/site-settings/route.ts",
  // sync/status 无查库，但静态求值会把「未配置」状态烤死进产物，
  // 桌面端运行时永远显示构建期状态
  "src/app/api/sync/status/route.ts",
  // generateStaticParams 调 listMedia()（force-dynamic 不跳过该阶段，
  // 另在源码里按 NEXT_DESKTOP 返回空数组，双保险）
  "src/app/api/media/[name]/route.ts",
  // 根布局渲染调 getAllTags()（无回退，/_not-found 与静态页面构建期必炸）；
  // 运行时仍需实时标签计数，故只能在构建期注入、构建后移除
  "src/app/layout.tsx",
]

// "use client" 页面跳过：Next 不读取客户端组件模块的路由段配置（实测注入后
// 路由表仍为 ○），且其构建期不查库（数据在浏览器端经 API 获取），无烧数据风险。
// 若强行注入还会破坏 "use client" 必须位于文件首行的约束。
const action = process.argv[2] // "add" or "remove"
const pages = findPages(resolve(root, "src/app"))
const targets = [
  ...pages,
  ...BUILD_TIME_DB_TARGETS.map((p) => resolve(root, p)),
]

for (const file of targets) {
  const content = readFileSync(file, "utf-8")
  if (content.startsWith(CLIENT_DIRECTIVE)) {
    continue
  }
  if (action === "add" && !content.startsWith(HEADER)) {
    writeFileSync(file, HEADER + content)
    console.log(`Added force-dynamic: ${file}`)
  } else if (action === "remove" && content.startsWith(HEADER)) {
    writeFileSync(file, content.slice(HEADER.length))
    console.log(`Removed force-dynamic: ${file}`)
  }
}
