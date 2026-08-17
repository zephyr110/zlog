import { createWriteStream, mkdirSync } from "node:fs"
import { join } from "node:path"
import { createServer } from "node:net"

/** IDE / 终端常注入已失效的 HTTPS_PROXY；子进程只接受 buildServerEnv 给出的代理。 */
const INHERITED_PROXY_KEYS = [
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "ALL_PROXY",
  "all_proxy",
  "ANALYTICS_HTTPS_PROXY",
] as const

export function envWithoutInheritedProxy(
  base: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const out = { ...base }
  for (const key of INHERITED_PROXY_KEYS) delete out[key]
  return out
}

/**
 * Next 服务子进程最小接口（utilityProcess 与测试 fake 共用）。
 * 不用 child_process.spawn(process.execPath)：macOS 会把第二个 Electron
 * 二进制当成独立 GUI 应用，Dock 多出一个名为 "exec" 的图标。
 */
export type ServerChild = {
  stdout: { on: (event: "data", listener: (chunk: Buffer) => void) => unknown } | null
  stderr: { on: (event: "data", listener: (chunk: Buffer) => void) => unknown } | null
  kill: () => boolean | void
  on: (event: "exit", listener: (code: number) => void) => void
}

export type ForkServer = (
  modulePath: string,
  env: NodeJS.ProcessEnv
) => ServerChild

/** 默认用 Chromium Services / Helper 拉起 Node，不进 Dock。 */
export function defaultForkServer(
  modulePath: string,
  env: NodeJS.ProcessEnv
): ServerChild {
  // 延迟 require：单测注入 fork 时不必加载 electron
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { utilityProcess } = require("electron") as typeof import("electron")
  return utilityProcess.fork(modulePath, [], {
    env,
    stdio: "pipe",
    serviceName: "zlog-web-server",
  })
}

/** 管理 Next standalone 服务器子进程（数据库唯一持有者）。 */
export class ServerManager {
  private child: ServerChild | null = null
  private currentPort = 0
  private logStream: ReturnType<typeof createWriteStream> | null = null

  constructor(
    private readonly serverJsPath: string,
    private readonly logDir: string,
    private readonly onExit: (code: number | null) => void,
    /** 测试注入点：健康检查函数。 */
    private readonly waitHealthy: (
      port: number,
      timeoutMs: number
    ) => Promise<void> = waitHealthyDefault,
    /** 测试注入点：拉起子进程（默认 utilityProcess.fork）。 */
    private readonly forkServer: ForkServer = defaultForkServer
  ) {}

  /** 探测一个空闲端口（释放后交给子进程使用；竞态窗口可接受）。 */
  async reservePort(): Promise<number> {
    const srv = createServer()
    await new Promise<void>((resolve, reject) => {
      srv.once("error", reject)
      srv.listen(0, "127.0.0.1", () => resolve())
    })
    const addr = srv.address()
    const port = typeof addr === "object" && addr ? addr.port : 0
    await new Promise<void>((resolve) => srv.close(() => resolve()))
    return port
  }

  async start(env: Record<string, string>): Promise<void> {
    this.currentPort = await this.reservePort()
    mkdirSync(this.logDir, { recursive: true })
    this.logStream = createWriteStream(join(this.logDir, "server.log"), { flags: "a" })
    // 日志流是尽力而为：fs.open 异步落地，目录被删/流已停止后到达的
    // open 或写入会触发 'error'（ENOENT）—— 不监听会变成未捕获异常
    // （CI Linux 实测：测试删目录后 open 落地导致 vitest 报 unhandled error）
    this.logStream.on("error", () => {})
    this.child = this.forkServer(this.serverJsPath, {
      ...envWithoutInheritedProxy(process.env),
      ...env,
      PORT: String(this.currentPort),
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
    })
    this.child.stdout?.on("data", (d: Buffer) => this.logStream?.write(d))
    this.child.stderr?.on("data", (d: Buffer) => this.logStream?.write(d))
    const child = this.child
    let aborted = false
    child.on("exit", (code) => {
      // 仅当仍是当前子进程时才清除引用：旧子进程（stop 或崩溃）延迟到达的
      // exit 事件不得清掉新启动的子进程，否则新进程失去管理（stop 无法
      // 终止它、重复服务器抢占同一个 db）。
      if (this.child === child) this.child = null
      // 健康检查失败时我们主动终止的子进程不算崩溃：不触发 onExit，
      // 否则 main 的 onServerExit 会把一次失败启动误判为服务崩溃。
      if (!aborted) this.onExit(code)
    })
    try {
      // 60s：负载下 Next 冷启动可超过 30s（CI/本机并发时实测超时）
      await this.waitHealthy(this.currentPort, 60_000)
    } catch (err) {
      // 回滚：未就绪即失败时终止刚拉起的子进程，否则它残留运行、
      // 占住端口与 db（stop() 的引用已清空，无法再终止它）。
      aborted = true
      child.kill()
      if (this.child === child) this.child = null
      this.logStream?.end()
      this.logStream = null
      throw err
    }
  }

  get url(): string {
    return `http://127.0.0.1:${this.currentPort}`
  }

  get port(): number {
    return this.currentPort
  }

  stop(): void {
    if (this.child) {
      this.child.kill()
      this.child = null
    }
    this.logStream?.end()
    this.logStream = null
  }
}

async function waitHealthyDefault(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.ok) return
    } catch {
      // 未就绪，继续轮询
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`server did not become healthy within ${timeoutMs}ms`)
}
