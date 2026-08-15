import net from "node:net"
import { Agent, type Dispatcher } from "undici"

/**
 * HTTP CONNECT / SOCKS5 代理 dispatcher（不依赖 undici ProxyAgent）。
 *
 * 2026-08 GA4 代理不可达修复（"Direct access failed; the proxy also timed
 * out"）：原实现把隧道握手包在 Promise 里、data 监听注册在 connect 回调
 * 内、并对 https 再包 tls.connect——undici 7 的 Agent 在 connect 回调返回
 * 后立即接管 socket（挂监听/写请求），上述任一偏差都会让请求挂起直至
 * headersTimeout。实测约束（本函数形态逐字通过验证）：
 * 1. data 监听在连接建立前注册（顶层，connect 监听之后）；
 * 2. done 同步回调（无 Promise 包装）；
 * 3. 返回已隧道的原始 TCP socket——undici 对自定义 connect 返回的 socket
 *    直接用作传输，再包 tls.connect 会对隧道做二次 TLS 握手；
 * 4. 隧道完成后 setTimeout(0) 清除 idle timeout（net.connect 的 timeout
 *    选项在连接后仍生效）。
 */
export function createProxyDispatcher(proxyUrl: string): Dispatcher {
  const proxy = new URL(proxyUrl)
  return new Agent({
    connectTimeout: 8_000,
    headersTimeout: 20_000,
    bodyTimeout: 30_000,
    connect(opts, cb) {
      let settled = false
      const done = (err: Error | null, sock?: net.Socket) => {
        if (settled) return
        settled = true
        cb(err, sock as never)
      }
      const s = net.connect({ host: proxy.hostname, port: Number(proxy.port) || 7892, timeout: 8000 })
      const fail = (err: Error) => { s.destroy(); done(err) }
      s.on("timeout", () => fail(new Error("proxy connect timeout")))
      s.once("error", fail)
      s.on("connect", () => {
        if (isSocks5ProxyUrl(proxyUrl)) {
          socks5Connect(s, opts.hostname, Number(opts.port), proxy, done)
        } else {
          s.write("CONNECT " + opts.hostname + ":" + opts.port + " HTTP/1.1\r\nHost: " + opts.hostname + ":" + opts.port + "\r\n\r\n")
        }
      })
      let buf = Buffer.alloc(0)
      const onData = (c: Buffer) => {
        buf = Buffer.concat([buf, c])
        const end = buf.indexOf("\r\n\r\n")
        if (end < 0) return
        s.off("data", onData)
        const extra = buf.subarray(end + 4)
        if (extra.length) s.unshift(extra)
        s.setTimeout(0)
        done(null, s)
      }
      s.on("data", onData)
    },
  })
}

/** SOCKS5 隧道（回调风格，与 connect 的同步契约一致）。 */
export function socks5Connect(
  socket: net.Socket,
  destHost: string,
  destPort: number,
  proxy: URL,
  done: (err: Error | null, tun?: net.Socket) => void
): void {
  const user = decodeURIComponent(proxy.username)
  const pass = decodeURIComponent(proxy.password)
  const methods = user ? Buffer.from([0x05, 0x01, 0x02]) : Buffer.from([0x05, 0x01, 0x00])
  let step: "auth" | "user" | "req" = "auth"
  let buf = Buffer.alloc(0)
  const onData = (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk])
    try {
      if (step === "auth") {
        if (buf.length < 2) return
        if (buf[0] !== 0x05) throw new Error("bad SOCKS5 greeting")
        const method = buf[1]
        buf = buf.subarray(2)
        if (method === 0x00) {
          step = "req"
          socket.write(socks5Request(destHost, destPort))
          return
        }
        if (method === 0x02 && user) {
          step = "user"
          const u = Buffer.from(user)
          const p = Buffer.from(pass)
          socket.write(Buffer.concat([Buffer.from([0x01, u.length]), u, Buffer.from([p.length]), p]))
          return
        }
        throw new Error("SOCKS5 auth not supported")
      }
      if (step === "user") {
        if (buf.length < 2) return
        if (buf[1] !== 0x00) throw new Error("SOCKS5 auth failed")
        buf = buf.subarray(2)
        step = "req"
        socket.write(socks5Request(destHost, destPort))
        return
      }
      const framed = socks5ReplyLength(buf)
      if (framed < 0) return
      if (buf[1] !== 0x00) throw new Error(`SOCKS5 CONNECT failed (${buf[1]})`)
      const extra = buf.subarray(framed)
      socket.off("data", onData)
      if (extra.length) socket.unshift(extra)
      socket.setTimeout(0)
      done(null, socket)
    } catch (err) {
      socket.off("data", onData)
      done(err instanceof Error ? err : new Error(String(err)))
    }
  }
  socket.on("data", onData)
  socket.write(methods, (err) => {
    if (err) done(err)
  })
}

function socks5ReplyLength(buf: Buffer): number {
  if (buf.length < 4) return -1
  const atyp = buf[3]
  if (atyp === 0x01) return buf.length >= 10 ? 10 : -1
  if (atyp === 0x04) return buf.length >= 22 ? 22 : -1
  return -1
}

function socks5Request(host: string, port: number): Buffer {
  let atyp: number
  let addr: Buffer
  if (net.isIPv4(host)) {
    atyp = 0x01
    addr = Buffer.from(host.split(".").map(Number))
  } else if (net.isIPv6(host)) {
    atyp = 0x04
    addr = Buffer.from(host.split(":").flatMap((s) => {
      const n = parseInt(s, 16) || 0
      return [n >> 8, n & 0xff]
    }))
  } else {
    atyp = 0x03
    const b = Buffer.from(host, "utf8")
    addr = Buffer.concat([Buffer.from([b.length]), b])
  }
  const head = Buffer.from([0x05, 0x01, 0x00, atyp])
  const portBuf = Buffer.alloc(2)
  portBuf.writeUInt16BE(port)
  return Buffer.concat([head, addr, portBuf])
}

export function isSocksProxyUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol
    return p === "socks:" || p === "socks4:" || p === "socks5:" || p === "socks5h:"
  } catch {
    return false
  }
}

export function isSocks5ProxyUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol
    return p === "socks:" || p === "socks5:" || p === "socks5h:"
  } catch {
    return false
  }
}

export function proxyListenPort(url: URL): number {
  if (url.port) return Number(url.port)
  if (url.protocol === "https:") return 443
  if (url.protocol === "http:") return 80
  if (isSocks5ProxyUrl(url.href)) return 1080
  return 0
}

export function formatConnectTarget(host: string, port: number): string {
  const safe = host.replace(/[\r\n]/g, "")
  const wrapped = safe.includes(":") && !safe.startsWith("[") ? `[${safe}]` : safe
  return `${wrapped}:${port}`
}

export function isCachedProxyEquivalent(cached: string, resolved: string): boolean {
  return cached === resolved || cached === socksUrlForHttpProxy(resolved)
}

export function socksUrlForHttpProxy(httpUrl: string): string | undefined {
  try {
    const u = new URL(httpUrl)
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined
    if (!u.hostname || !u.port) return undefined
    return `socks5://${u.hostname}:${u.port}`
  } catch {
    return undefined
  }
}
