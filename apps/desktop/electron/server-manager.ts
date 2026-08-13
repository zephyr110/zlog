import { spawn, type ChildProcess } from "node:child_process"
import { createWriteStream, mkdirSync } from "node:fs"
import { join } from "node:path"
import { createServer } from "node:net"

/** 管理 Next standalone 服务器子进程（数据库唯一持有者）。 */
export class ServerManager {
  private child: ChildProcess | null = null
  private currentPort = 0
  private logStream: ReturnType<typeof createWriteStream> | null = null

  constructor(
    private readonly serverJsPath: string,
    private readonly logDir: string,
    private readonly onExit: (code: number | null) => void,
    /** 测试注入点：健康检查函数。 */
    private readonly waitHealthy: (port: number, timeoutMs: number) => Promise<void> = waitHealthyDefault
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
    this.child = spawn(process.execPath, [this.serverJsPath], {
      env: {
        ...process.env,
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(this.currentPort),
        HOSTNAME: "127.0.0.1",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    this.child.stdout?.on("data", (d: Buffer) => this.logStream?.write(d))
    this.child.stderr?.on("data", (d: Buffer) => this.logStream?.write(d))
    const child = this.child
    child.on("exit", (code) => {
      // 仅当仍是当前子进程时才清除引用：旧子进程（stop 或崩溃）延迟到达的
      // exit 事件不得清掉新启动的子进程，否则新进程失去管理（stop 无法
      // 终止它、重复服务器抢占同一个 db）。
      if (this.child === child) this.child = null
      this.onExit(code)
    })
    await this.waitHealthy(this.currentPort, 30_000)
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
