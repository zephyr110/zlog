import { describe, it, expect, afterEach } from "vitest"
import { createRequire } from "node:module"
import { createServer as createNetServer, connect as netConnect, type Server as NetServer } from "node:net"
import { createServer as createHttpServer, type Server as HttpServer } from "node:http"
import {
  isCachedProxyEquivalent,
  isSocks5ProxyUrl,
  isSocksProxyUrl,
  proxyListenPort,
  socksUrlForHttpProxy,
} from "../../web/src/lib/proxy-dispatcher"

const { fetch: undiciFetch, ProxyAgent } = createRequire(
  new URL("../../web/package.json", import.meta.url)
)("undici") as { fetch: typeof fetch; ProxyAgent: new (uri: string) => unknown }

let http: HttpServer | undefined
let proxy: NetServer | undefined
const sockets: import("node:net").Socket[] = []

afterEach(async () => {
  for (const s of sockets) s.destroy()
  sockets.length = 0
  await new Promise<void>((resolve) => http?.close(() => resolve()) ?? resolve())
  await new Promise<void>((resolve) => proxy?.close(() => resolve()) ?? resolve())
  http = undefined
  proxy = undefined
})

/** 本地 HTTP 服务（作为 CONNECT 隧道的目的地）。 */
function startTarget(): Promise<string> {
  return new Promise((resolve) => {
    const server = createHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("ok")
    })
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      if (addr && typeof addr === "object") resolve(`http://127.0.0.1:${addr.port}/`)
    })
    server.on("connection", (s) => sockets.push(s))
    http = server
  })
}

/** 本地 HTTP CONNECT 代理：转发隧道到目标端口。 */
function startConnectProxy(): Promise<{ host: string; port: number }> {
  return new Promise((resolve) => {
    const server = createNetServer((socket) => {
      sockets.push(socket)
      let buf = Buffer.alloc(0)
      socket.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk])
        const end = buf.indexOf("\r\n\r\n")
        if (end < 0) return
        const head = buf.subarray(0, end).toString("utf8")
        const m = /^CONNECT (\S+)/m.exec(head)
        if (!m) {
          socket.end("HTTP/1.1 400 Bad Request\r\n\r\n")
          return
        }
        const [host, port] = m[1].split(":")
        const upstream = netConnect(Number(port), host)
        sockets.push(upstream)
        socket.write("HTTP/1.1 200 Connection established\r\n\r\n")
        // 目标不可达时避免 uncaught 'error' 崩溃整个测试进程
        upstream.on("error", () => socket.destroy())
        upstream.on("connect", () => {
          socket.pipe(upstream)
          upstream.pipe(socket)
        })
        socket.removeAllListeners("data")
      })
    })
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      if (addr && typeof addr === "object") resolve({ host: "127.0.0.1", port: addr.port })
    })
    proxy = server
  })
}

describe("proxy URL 工具函数", () => {
  it("proxyListenPort 按协议默认端口", () => {
    expect(proxyListenPort(new URL("http://127.0.0.1:8080"))).toBe(8080)
    expect(proxyListenPort(new URL("http://host"))).toBe(80)
    expect(proxyListenPort(new URL("https://host"))).toBe(443)
    expect(proxyListenPort(new URL("socks5://host"))).toBe(1080)
    expect(proxyListenPort(new URL("ftp://host"))).toBe(0)
  })

  it("isSocksProxyUrl / isSocks5ProxyUrl 协议判定", () => {
    for (const u of ["socks://h:1", "socks4://h:1", "socks5://h:1", "socks5h://h:1"]) {
      expect(isSocksProxyUrl(u)).toBe(true)
    }
    expect(isSocksProxyUrl("http://h:1")).toBe(false)
    expect(isSocksProxyUrl("junk")).toBe(false)
    // socks5 系列（socks5h 归入——语义差异由调用方处理）
    expect(isSocks5ProxyUrl("socks5://h:1")).toBe(true)
    expect(isSocks5ProxyUrl("socks5h://h:1")).toBe(true)
    expect(isSocks5ProxyUrl("socks4://h:1")).toBe(false)
  })

  it("socksUrlForHttpProxy 转换并保留 userinfo", () => {
    expect(socksUrlForHttpProxy("http://127.0.0.1:7892")).toBe("socks5://127.0.0.1:7892")
    expect(socksUrlForHttpProxy("http://user:pass@127.0.0.1:7892")).toBe("socks5://user:pass@127.0.0.1:7892")
    // 无显式端口不可转换（socks 隧道需要端口）
    expect(socksUrlForHttpProxy("https://host")).toBeUndefined()
    expect(socksUrlForHttpProxy("socks5://h:1")).toBeUndefined()
  })

  it("isCachedProxyEquivalent 的 http/socks 等价判定", () => {
    expect(isCachedProxyEquivalent("http://h:1", "http://h:1")).toBe(true)
    expect(isCachedProxyEquivalent("socks5://h:1", "http://h:1")).toBe(true)
    expect(isCachedProxyEquivalent("http://h:2", "http://h:1")).toBe(false)
  })
})

describe("ProxyAgent 走本地 CONNECT 代理", () => {
  it("隧道请求成功（标准 ProxyAgent 全链路）", async () => {
    const targetUrl = await startTarget()
    const { port } = await startConnectProxy()
    const agent = new ProxyAgent(`http://127.0.0.1:${port}`) as {
      dispatch: unknown
    }
    const res = await undiciFetch(targetUrl, {
      dispatcher: agent as never,
      connectTimeout: 8_000,
      headersTimeout: 20_000,
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("ok")
  })
})
