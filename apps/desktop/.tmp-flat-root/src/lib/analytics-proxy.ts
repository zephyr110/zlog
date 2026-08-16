import {
  Agent,
  ProxyAgent,
  Socks5ProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
} from "undici"
import { readFileSync } from "node:fs"
import net from "node:net"
import {
  collectProxyCandidates,
  envLocalFilePaths,
  isDesktopAnalyticsProcess,
  isLoopbackProxyUrl,
  parseDotenvProxyValues,
  selectProxyUrl,
  trustedProxyUrls,
} from "@/lib/analytics-proxy-env"
import {
  isCachedProxyEquivalent,
  isSocksProxyUrl,
  proxyListenPort,
  socksUrlForHttpProxy,
} from "@/lib/proxy-dispatcher"
import type { AnalyticsTimeoutHint } from "@/lib/analytics-shared"

/**
 * 代理请求客户端：代理 URL 解析（memoized）、官方 Agent 构建、以及
 * direct → proxy 的 failover fetch。与具体数据源（GA4 / Vercel）解耦，
 * vercel-analytics 与 ga-analytics 共用同一代理策略与超时边界。
 *
 * 用 undici 官方 ProxyAgent / Socks5ProxyAgent——手写 CONNECT dispatcher
 * 无法正确完成隧道 + TLS（见 proxy-dispatcher.ts 头部说明）。超时配置在
 * Agent 上：undici 的 fetch 不读 connectTimeout/headersTimeout/bodyTimeout
 * （实测挂起 300s），Agent 默认 headers/body 超时 300s 会让半死代理把
 * 仪表盘挂 5 分钟——沿用原实现的 8s/20s/30s 边界。
 */

const PROXY_AGENT_TIMEOUTS = {
  connectTimeout: 8_000,
  headersTimeout: 20_000,
  bodyTimeout: 30_000,
}

/** 直接路径：短连接超时让被墙的 Google IP 快速 failover；
 *  autoSelectFamily 在 IPv6 被黑洞时优先 IPv4。 */
const directAgent = new Agent({
  connectTimeout: 4_000,
  headersTimeout: 20_000,
  bodyTimeout: 30_000,
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: 300,
})

export const NETWORK_ERROR_RE =
  /DEADLINE_EXCEEDED|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|ConnectTimeout|UND_ERR/i

/** direct → proxy failover 后短暂优先代理：OAuth + batchRunReports
 *  不必每次都在被墙的 direct 路径上烧 connectTimeout。 */
const PREFER_PROXY_MS = 60_000

function isNetworkFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: unknown }).code)
      : ""
  const cause =
    typeof err === "object" && err && "cause" in err
      ? String((err as { cause: unknown }).cause)
      : ""
  return NETWORK_ERROR_RE.test(`${code} ${message} ${cause}`)
}

/** Bracket access so Next/webpack cannot compile `process.env.HTTPS_PROXY`
 *  to `undefined` when the var was missing at bundling time. */
function envTrim(name: string): string | undefined {
  const raw = process.env[name]
  const url = typeof raw === "string" ? raw.trim() : ""
  return url || undefined
}

function readEnvLocalText(): string | undefined {
  for (const filePath of envLocalFilePaths(process.cwd())) {
    try {
      return readFileSync(filePath, "utf8")
    } catch {
      /* cwd 可能是仓库根、apps/web 或 .next */
    }
  }
  return undefined
}

function tcpReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const socket = net.connect({ host, port })
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once("connect", () => done(true))
    socket.once("error", () => done(false))
  })
}

async function isUsableProxy(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url)
    const port = proxyListenPort(parsed)
    if (!parsed.hostname || port <= 0) return false
    if (!isLoopbackProxyUrl(url)) return true
    return tcpReachable(parsed.hostname, port, 600)
  } catch {
    return false
  }
}

function isHostedVercel(): boolean {
  const env = envTrim("VERCEL_ENV")
  return env === "production" || env === "preview"
}

/** 脱敏代理 URL（日志输出用：去掉 userinfo，避免凭据落日志）。 */
function redactProxyUrl(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl)
    return `${u.protocol}//${u.host}`
  } catch {
    return "(invalid proxy url)"
  }
}

function createProxyDispatcher(proxyUrl: string): Dispatcher | undefined {
  if (isSocksProxyUrl(proxyUrl)) {
    const protocol = new URL(proxyUrl).protocol
    // undici Socks5ProxyAgent 只接受 socks5:/socks:；socks5h（远端 DNS）
    // 降级为 socks5（本地解析，语义差异可接受）；socks4/socks4a 不支持
    if (protocol === "socks4:" || protocol === "socks4a:") {
      console.warn(
        "[analytics] socks4 proxy not supported, running direct:",
        redactProxyUrl(proxyUrl)
      )
      return undefined
    }
    const normalized = proxyUrl.replace(/^socks5h:/i, "socks5:")
    // Socks5ProxyAgent 是 (proxyUrl, options) 两参数构造；ProxyAgent 是
    // 单参数 opts（string 或 { uri, ...AgentOptions }）——超时分别按各自
    // 签名传入，否则 Agent 默认 headers/body 超时 300s 会让半死代理
    // 把仪表盘挂 5 分钟
    return new Socks5ProxyAgent(normalized, PROXY_AGENT_TIMEOUTS)
  }
  return new ProxyAgent({ uri: proxyUrl, ...PROXY_AGENT_TIMEOUTS })
}

function socksFallbackUrl(proxyUrl: string | undefined): string | undefined {
  if (!proxyUrl || isSocksProxyUrl(proxyUrl)) return undefined
  return socksUrlForHttpProxy(proxyUrl)
}

/**
 * 代理请求客户端。状态（代理缓存、memoized 解析、prefer-proxy 窗口）
 * 封装在实例内：可独立实例化（测试/多配置），互不污染。
 */
export class ProxyFetchClient {
  private cachedProxyAgent: Dispatcher | undefined
  private cachedProxyUrl: string | undefined
  private resolvedProxyUrl: string | undefined
  private didResolveProxyUrl = false
  private resolveProxyUrlInflight: Promise<string | undefined> | undefined
  private preferProxyUntil = 0

  /** Vercel production/preview 可直连 Google；拷来的 HTTPS_PROXY=127.0.0.1
   *  只会指向 serverless 实例自己的回环、徒增超时。 */
  private async resolveProxyUrl(): Promise<string | undefined> {
    if (isHostedVercel()) return undefined
    const desktop = isDesktopAnalyticsProcess(process.env)
    const fileText = desktop ? undefined : readEnvLocalText()
    const fileUrls = fileText ? parseDotenvProxyValues(fileText) : []
    const candidates = collectProxyCandidates({
      env: process.env,
      fileText,
    })
    const chosen = await selectProxyUrl(
      candidates,
      trustedProxyUrls({ desktop, fileUrls, candidates }),
      isUsableProxy
    )
    if (!chosen && candidates.length > 0) {
      console.warn("[analytics] no usable proxy", {
        cwd: process.cwd(),
        fileFound: Boolean(fileText),
        candidateCount: candidates.length,
      })
    }
    return chosen
  }

  private async resolveProxyUrlOnce(): Promise<string | undefined> {
    if (this.didResolveProxyUrl) return this.resolvedProxyUrl
    if (!this.resolveProxyUrlInflight) {
      this.resolveProxyUrlInflight = this.resolveProxyUrl().then((url) => {
        this.resolvedProxyUrl = url
        this.didResolveProxyUrl = true
        this.resolveProxyUrlInflight = undefined
        return url
      })
    }
    return this.resolveProxyUrlInflight
  }

  private cachedDispatcherMatches(proxyUrl: string): boolean {
    if (!this.cachedProxyAgent || !this.cachedProxyUrl) return false
    return isCachedProxyEquivalent(this.cachedProxyUrl, proxyUrl)
  }

  private async getProxyDispatcher(): Promise<Dispatcher | undefined> {
    const proxyUrl = await this.resolveProxyUrlOnce()
    if (!proxyUrl) {
      this.cachedProxyAgent = undefined
      this.cachedProxyUrl = undefined
      return undefined
    }
    if (this.cachedDispatcherMatches(proxyUrl)) return this.cachedProxyAgent
    try {
      this.cachedProxyUrl = proxyUrl
      this.cachedProxyAgent = createProxyDispatcher(proxyUrl)
      // createProxyDispatcher 可能返回 undefined（socks4 不支持等）：同样
      // 清空缓存，否则缓存永不匹配、每次 fetch 都重建 + 重复 warn
      if (!this.cachedProxyAgent) this.cachedProxyUrl = undefined
      return this.cachedProxyAgent
    } catch {
      // Bad HTTPS_PROXY (invalid URL etc.) — keep the original network error
      // instead of masking it with dispatcher construction failure.
      this.cachedProxyAgent = undefined
      this.cachedProxyUrl = undefined
      return undefined
    }
  }

  private async fetchOnce(
    input: string,
    init: {
      method?: string
      headers?: Record<string, string>
      body?: string
    } | undefined,
    dispatcher: Dispatcher
  ): Promise<Response> {
    // 超时在 Agent 构造时配置（directAgent 与代理 Agent）——undici 的 fetch
    // 不读 connectTimeout/headersTimeout/bodyTimeout 选项
    return undiciFetch(input, {
      method: init?.method,
      headers: init?.headers,
      body: init?.body,
      dispatcher,
    }) as unknown as Response
  }

  private markProxyAttempted(err: unknown): never {
    const wrapped =
      typeof err === "object" && err !== null ? err : new Error(String(err))
    ;(wrapped as { proxyAttempted?: boolean }).proxyAttempted = true
    throw wrapped
  }

  /**
   * Direct first. If that fails with a network error and a system/env
   * HTTP proxy is available, retry once through it. Never a baked-in
   * localhost port — the URL comes from HTTPS_PROXY or the OS VPN proxy.
   */
  async fetch(
    input: string,
    init?: {
      method?: string
      headers?: Record<string, string>
      body?: string
    }
  ): Promise<Response> {
    const proxy = await this.getProxyDispatcher()
    const preferProxy = Boolean(proxy && Date.now() < this.preferProxyUntil)

    if (preferProxy && proxy) {
      try {
        return await this.fetchOnce(input, init, proxy)
      } catch (proxyErr) {
        try {
          return await this.fetchOnce(input, init, directAgent)
        } catch {
          this.markProxyAttempted(proxyErr)
        }
      }
    }

    try {
      return await this.fetchOnce(input, init, directAgent)
    } catch (err) {
      if (!proxy || !isNetworkFailure(err)) throw err
      console.warn(
        "[analytics] direct Google request failed; retrying via HTTP/SOCKS proxy"
      )
      try {
        const res = await this.fetchOnce(input, init, proxy)
        this.preferProxyUntil = Date.now() + PREFER_PROXY_MS
        return res
      } catch (proxyErr) {
        const socksUrl = socksFallbackUrl(this.cachedProxyUrl)
        if (socksUrl) {
          try {
            const socks = createProxyDispatcher(socksUrl)
            if (socks) {
              const res = await this.fetchOnce(input, init, socks)
              this.cachedProxyUrl = socksUrl
              this.cachedProxyAgent = socks
              this.preferProxyUntil = Date.now() + PREFER_PROXY_MS
              return res
            }
          } catch {
            /* 继续抛出原代理错误 */
          }
        }
        this.cachedProxyAgent = undefined
        this.cachedProxyUrl = undefined
        this.markProxyAttempted(proxyErr)
      }
    }
  }

  /** 错误分类辅助：是否尝试过代理（UI 文案区分 direct/proxy 超时）。 */
  timeoutHint(err: unknown): AnalyticsTimeoutHint {
    const proxyAttempted =
      typeof err === "object" &&
      err !== null &&
      "proxyAttempted" in err &&
      Boolean((err as { proxyAttempted?: unknown }).proxyAttempted)
    if (isHostedVercel()) return "hosted"
    return proxyAttempted ? "proxy" : "direct"
  }
}

/** 全局单例（数据源共用同一代理策略与缓存）。 */
const proxyFetchClient = new ProxyFetchClient()

export const analyticsFetch = proxyFetchClient.fetch.bind(proxyFetchClient)
export const analyticsTimeoutHint = proxyFetchClient.timeoutHint.bind(proxyFetchClient)
