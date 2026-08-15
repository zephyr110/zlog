import { join } from "node:path"

const PROXY_ENV_KEYS = [
  "ANALYTICS_HTTPS_PROXY",
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "ALL_PROXY",
  "all_proxy",
] as const

function stripDotenvValue(raw: string): string {
  let v = raw.trim()
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1)
  }
  return v.trim()
}

/** 从 .env.local 文本抽出代理值（不执行、不展开其它键）。 */
export function parseDotenvProxyValues(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (!PROXY_ENV_KEYS.includes(key as (typeof PROXY_ENV_KEYS)[number])) continue
    const value = stripDotenvValue(trimmed.slice(eq + 1))
    if (value) out.push(value)
  }
  return out
}

/** `.env.local` 里的值优先（用户写的），再并进程 env（IDE 常注入已失效的 HTTPS_PROXY）。 */
export function collectProxyCandidates(opts: {
  env: Record<string, string | undefined>
  fileText?: string
}): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (raw: string | undefined) => {
    const url = raw?.trim()
    if (!url || seen.has(url)) return
    seen.add(url)
    out.push(url)
  }
  if (opts.fileText) {
    for (const url of parseDotenvProxyValues(opts.fileText)) add(url)
  }
  for (const key of PROXY_ENV_KEYS) add(opts.env[key])
  return out
}

export function envLocalFilePaths(cwd: string): string[] {
  return [
    join(cwd, ".env.local"),
    join(cwd, "apps", "web", ".env.local"),
    join(cwd, "..", ".env.local"),
    join(cwd, "..", "apps", "web", ".env.local"),
  ]
}

/** 桌面 Next 子进程：代理已由 Electron 解析后注入，不要再读 web 的 .env.local。 */
export function isDesktopAnalyticsProcess(
  env: Record<string, string | undefined>
): boolean {
  return Boolean(env.ZLOG_DESKTOP_KEY?.trim())
}

/** 桌面信任已注入的 env；本地 web 只信任 .env.local，进程 env 仍需探测。 */
export function trustedProxyUrls(opts: {
  desktop: boolean
  fileUrls: readonly string[]
  candidates: readonly string[]
}): string[] {
  return opts.desktop ? [...opts.candidates] : [...opts.fileUrls]
}

/** `.env.local` 里的代理直接采用，不因 TCP 探测失败丢掉；进程 env 仍需探测。 */
export async function selectProxyUrl(
  candidates: string[],
  fileUrls: readonly string[],
  isUsable: (url: string) => Promise<boolean>
): Promise<string | undefined> {
  const fromFile = new Set(fileUrls)
  for (const url of candidates) {
    if (fromFile.has(url)) return url
    if (await isUsable(url)) return url
  }
  return undefined
}

export function isLoopbackProxyUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]"
  } catch {
    return false
  }
}
