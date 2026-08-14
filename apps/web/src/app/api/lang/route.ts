import { NextResponse } from "next/server"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

/**
 * 桌面端语言单一事实源（userData/lang.json，格式见 desktop/electron/lang.ts）。
 *
 * 博客/admin 窗口因安全原因不挂 preload（会暴露密钥），主进程把 lang.json
 * 路径经 DESKTOP_LANG_FILE 注入服务器 env；本路由让 web 界面读写同一文件：
 * - GET：返回 { pref, resolved }（i18n-provider 初始化用）
 * - POST：写入显式语言（zh|en）——web 界面的语言切换是两态，写入即覆盖
 *   "跟随系统"（与设置窗口三态下拉互斥，属预期）
 *
 * 纯 web 构建（GitHub Pages / 无 env）下 404，i18n-provider 回落
 * localStorage 逻辑，行为与桌面端接入前一致。
 */
const ALLOWED = new Set(["zh", "en"])

function langFilePath(): string | null {
  const p = process.env.DESKTOP_LANG_FILE
  return p || null
}

export async function GET() {
  const p = langFilePath()
  if (!p || !existsSync(p)) {
    return NextResponse.json({ desktop: false }, { status: 404 })
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as {
      pref?: unknown
      resolved?: unknown
    }
    if (
      (raw.pref !== "system" && raw.pref !== "zh" && raw.pref !== "en") ||
      (raw.resolved !== "zh" && raw.resolved !== "en")
    ) {
      return NextResponse.json({ desktop: false }, { status: 500 })
    }
    return NextResponse.json(raw)
  } catch {
    return NextResponse.json({ desktop: false }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const p = langFilePath()
  if (!p) {
    return NextResponse.json({ error: "not a desktop build" }, { status: 404 })
  }
  const body = (await req.json().catch(() => null)) as { pref?: unknown } | null
  const pref = body?.pref
  if (typeof pref !== "string" || !ALLOWED.has(pref)) {
    return NextResponse.json({ error: "pref must be zh or en" }, { status: 400 })
  }
  const state = { pref, resolved: pref }
  try {
    mkdirSync(dirname(p), { recursive: true, mode: 0o700 })
    writeFileSync(p, JSON.stringify(state, null, 2), { mode: 0o600 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
  return NextResponse.json(state)
}
