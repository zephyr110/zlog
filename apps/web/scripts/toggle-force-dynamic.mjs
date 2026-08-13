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

// "use client" 页面跳过：Next 不读取客户端组件模块的路由段配置（实测注入后
// 路由表仍为 ○），且其构建期不查库（数据在浏览器端经 API 获取），无烧数据风险。
// 若强行注入还会破坏 "use client" 必须位于文件首行的约束。
const action = process.argv[2] // "add" or "remove"
const pages = findPages(resolve(root, "src/app"))

for (const file of pages) {
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
