import net from "node:net"
import tls from "node:tls"
import { Agent, type Dispatcher } from "undici"

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

/** HTTP CONNECT 或 SOCKS5，不依赖 undici ProxyAgent（Electron-as-Node 下更稳）。 */
export function createProxyDispatcher(proxyUrl: string): Dispatcher {
  const proxy = new URL(proxyUrl)
  const port = proxyListenPort(proxy)
  if (!proxy.hostname || !Number.isFinite(port) || port <= 0) {
    throw new Error("invalid proxy url")
  }
  const socks = isSocks5ProxyUrl(proxyUrl)
  return new Agent({
    connectTimeout: 8_000,
    headersTimeout: 20_000,
    bodyTimeout: 30_000,
    connect(options, callback) {
      let settled = false
      const done = (err: Error | null, sock?: net.Socket | tls.TLSSocket) => {
        if (settled) return
        settled = true
        callback(err, sock as never)
      }
      const destHost = options.hostname
      const destPort = Number(options.port)
      const socket = net.connect({ host: proxy.hostname, port, timeout: 8_000 })
      const fail = (err: Error) => {
        socket.destroy()
        done(err)
      }
      socket.on("timeout", () => fail(new Error("proxy connect timeout")))
      socket.once("error", fail)
      socket.once("connect", () => {
        // TCP 已连上后仍要限时：有的代理收连接但不完成握手。
        socket.setTimeout(8_000)
        const tunneled = socks
          ? socks5Connect(socket, destHost, destPort, proxy)
          : httpConnect(socket, destHost, destPort)
        void tunneled
          .then((tun) => {
            socket.setTimeout(0)
            socket.removeListener("error", fail)
            if (options.protocol === "https:") {
              const tlsSock = tls.connect(
                {
                  socket: tun,
                  servername: options.servername || destHost,
                  ALPNProtocols: ["http/1.1"],
                },
                () => done(null, tlsSock)
              )
              tlsSock.once("error", (err) => done(err))
            } else {
              done(null, tun)
            }
          })
          .catch(fail)
      })
    },
  })
}

function httpConnect(
  socket: net.Socket,
  destHost: string,
  destPort: number
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const target = formatConnectTarget(destHost, destPort)
    const req = `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`
    let buf = Buffer.alloc(0)
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      const end = buf.indexOf("\r\n\r\n")
      if (end < 0) return
      socket.off("data", onData)
      const head = buf.subarray(0, end).toString("utf8")
      const extra = buf.subarray(end + 4)
      if (!/^HTTP\/1\.[01] 200\b/i.test(head)) {
        reject(new Error(`proxy CONNECT failed: ${head.split("\r\n")[0] ?? head}`))
        return
      }
      if (extra.length) socket.unshift(extra)
      resolve(socket)
    }
    socket.on("data", onData)
    socket.write(req, (err) => {
      if (err) reject(err)
    })
  })
}

function socks5Connect(
  socket: net.Socket,
  destHost: string,
  destPort: number,
  proxy: URL
): Promise<net.Socket> {
  const user = decodeURIComponent(proxy.username)
  const pass = decodeURIComponent(proxy.password)
  return new Promise((resolve, reject) => {
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
        resolve(socket)
      } catch (err) {
        socket.off("data", onData)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    socket.on("data", onData)
    socket.write(methods, (err) => {
      if (err) reject(err)
    })
  })
}

function socks5ReplyLength(buf: Buffer): number {
  if (buf.length < 4) return -1
  const atyp = buf[3]
  if (atyp === 0x01) return buf.length >= 10 ? 10 : -1
  if (atyp === 0x04) return buf.length >= 22 ? 22 : -1
  if (atyp === 0x03) {
    if (buf.length < 5) return -1
    const need = 7 + buf[4]
    return buf.length >= need ? need : -1
  }
  throw new Error("bad SOCKS5 ATYP")
}

function socks5Request(host: string, port: number): Buffer {
  const name = Buffer.from(host)
  const req = Buffer.alloc(7 + name.length)
  req[0] = 0x05
  req[1] = 0x01
  req[2] = 0x00
  req[3] = 0x03
  req[4] = name.length
  name.copy(req, 5)
  req.writeUInt16BE(port, 5 + name.length)
  return req
}
