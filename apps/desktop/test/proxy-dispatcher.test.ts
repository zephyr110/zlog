import { describe, it, expect, afterEach } from "vitest"
import { createRequire } from "node:module"
import { createServer as createNetServer, connect as netConnect, type Server as NetServer } from "node:net"
import { createServer as createHttpServer, type Server as HttpServer } from "node:http"
import {
  createProxyDispatcher,
  formatConnectTarget,
  isCachedProxyEquivalent,
  isSocks5ProxyUrl,
  isSocksProxyUrl,
  proxyListenPort,
  socksUrlForHttpProxy,
} from "../../web/src/lib/proxy-dispatcher"

const { fetch: undiciFetch } = createRequire(
  new URL("../../web/package.json", import.meta.url)
)("undici") as { fetch: typeof fetch }

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

function listen(server: NetServer): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      resolve(typeof addr === "object" && addr ? addr.port : 0)
    })
  })
}

describe("proxy-dispatcher helpers", () => {
  it("认 socks URL", () => {
    expect(isSocksProxyUrl("socks5://127.0.0.1:1080")).toBe(true)
    expect(isSocks5ProxyUrl("socks4://127.0.0.1:1080")).toBe(false)
    expect(isSocksProxyUrl("http://127.0.0.1:1080")).toBe(false)
    expect(socksUrlForHttpProxy("http://127.0.0.1:1080")).toBe("socks5://127.0.0.1:1080")
    expect(
      isCachedProxyEquivalent("socks5://127.0.0.1:1080", "http://127.0.0.1:1080")
    ).toBe(true)
    expect(
      isCachedProxyEquivalent("http://127.0.0.1:1080", "http://127.0.0.1:1080")
    ).toBe(true)
  })

  it("补全 URL 默认端口，IPv6 CONNECT 带方括号", () => {
    expect(proxyListenPort(new URL("http://127.0.0.1:80"))).toBe(80)
    expect(proxyListenPort(new URL("https://proxy.example:443"))).toBe(443)
    expect(formatConnectTarget("::1", 443)).toBe("[::1]:443")
    expect(formatConnectTarget("example.com", 443)).toBe("example.com:443")
  })
})

describe("createProxyDispatcher HTTP CONNECT", () => {
  it("经本地 CONNECT 代理打到目标 HTTP", async () => {
    http = createHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("ok")
    })
    const destPort = await listen(http)

    proxy = createNetServer((socket) => {
      sockets.push(socket)
      let buf = Buffer.alloc(0)
      const onData = (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk])
        const end = buf.indexOf("\r\n\r\n")
        if (end < 0) return
        socket.off("data", onData)
        const head = buf.subarray(0, end).toString("utf8")
        const m = /^CONNECT\s+([^:]+):(\d+)/i.exec(head)
        if (!m) {
          socket.end("HTTP/1.1 400 Bad Request\r\n\r\n")
          return
        }
        const tunnel = netConnect(Number(m[2]), m[1], () => {
          socket.write("HTTP/1.1 200 Connection established\r\n\r\n")
          socket.pipe(tunnel)
          tunnel.pipe(socket)
        })
        tunnel.on("error", () => socket.destroy())
      }
      socket.on("data", onData)
    })
    const proxyPort = await listen(proxy)
    const dispatcher = createProxyDispatcher(`http://127.0.0.1:${proxyPort}`)
    const res = await undiciFetch(`http://127.0.0.1:${destPort}/`, { dispatcher })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("ok")
  })

  it("代理只收 TCP 不完成握手时在超时内失败", async () => {
    proxy = createNetServer((socket) => {
      sockets.push(socket)
      /* 挂起，不回 CONNECT */
    })
    const proxyPort = await listen(proxy)
    const dispatcher = createProxyDispatcher(`http://127.0.0.1:${proxyPort}`)
    const t0 = Date.now()
    await expect(
      undiciFetch("https://example.com/", { dispatcher })
    ).rejects.toThrow()
    expect(Date.now() - t0).toBeLessThan(12_000)
  }, 15_000)
})
