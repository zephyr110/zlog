import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ServerManager,
  envWithoutInheritedProxy,
  type ForkServer,
  type ServerChild,
} from "../electron/server-manager"

function fakeChild(): ServerChild & { emit: (ev: string, ...args: unknown[]) => void } {
  const events: Record<string, Function[]> = {}
  return {
    stdout: { on: vi.fn((ev, cb) => cb?.("stdout-data")) } as unknown as ServerChild["stdout"],
    stderr: { on: vi.fn() } as unknown as ServerChild["stderr"],
    kill: vi.fn(() => true),
    on: (ev, cb) => {
      events[ev] = [...(events[ev] || []), cb]
    },
    emit: (ev, ...args) => (events[ev] || []).forEach((cb) => cb(...args)),
  }
}

describe("envWithoutInheritedProxy", () => {
  it("去掉父进程代理 env，避免 IDE 死代理传给 Next", () => {
    const cleaned = envWithoutInheritedProxy({
      PATH: "/bin",
      HTTPS_PROXY: "http://127.0.0.1:1",
      https_proxy: "http://127.0.0.1:1",
      ALL_PROXY: "socks5://127.0.0.1:1",
      ANALYTICS_HTTPS_PROXY: "http://127.0.0.1:1",
    })
    expect(cleaned.PATH).toBe("/bin")
    expect(cleaned.HTTPS_PROXY).toBeUndefined()
    expect(cleaned.https_proxy).toBeUndefined()
    expect(cleaned.ALL_PROXY).toBeUndefined()
    expect(cleaned.ANALYTICS_HTTPS_PROXY).toBeUndefined()
  })
})

describe("ServerManager", () => {
  let dir: string
  let forkMock: ReturnType<typeof vi.fn<ForkServer>>
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "zlog-srv-"))
    forkMock = vi.fn()
  })
  // createWriteStream 的 fs.open 是异步的：删除目录可能撞上 open 落地，
  // 触发 ENOTEMPTY（或删除后到达的 open 抛未捕获 ENOENT）—— 短暂重试
  // 直到目录可删，提高稳定性。
  afterEach(async () => {
    await new Promise((resolve) => setImmediate(resolve))
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        rmSync(dir, { recursive: true, force: true })
        return
      } catch (err) {
        if ((err as { code?: string }).code !== "ENOTEMPTY") throw err
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it("start 以 utilityProcess 风格 fork 拉起服务器并绑定 127.0.0.1（不设 ELECTRON_RUN_AS_NODE）", async () => {
    const child = fakeChild()
    forkMock.mockReturnValue(child)
    const onExit = vi.fn()
    const mgr = new ServerManager(
      "/fake/server.js",
      dir,
      onExit,
      async () => {},
      forkMock
    )
    await mgr.start({ TURSO_DATABASE_URL: "file:test.db", SESSION_SECRET: "s" })
    expect(forkMock).toHaveBeenCalledTimes(1)
    const [modulePath, env] = forkMock.mock.calls[0]
    expect(modulePath).toBe("/fake/server.js")
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.HOSTNAME).toBe("127.0.0.1")
    expect(env.HTTPS_PROXY).toBeUndefined()
    expect(env.https_proxy).toBeUndefined()
    expect(env.ALL_PROXY).toBeUndefined()
    expect(Number(env.PORT)).toBeGreaterThan(0)
    expect(mgr.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  it("服务器退出触发 onExit 回调", async () => {
    const child = fakeChild()
    forkMock.mockReturnValue(child)
    const onExit = vi.fn()
    const mgr = new ServerManager(
      "/fake/server.js",
      dir,
      onExit,
      async () => {},
      forkMock
    )
    await mgr.start({ TURSO_DATABASE_URL: "file:test.db", SESSION_SECRET: "s" })
    child.emit("exit", 1)
    expect(onExit).toHaveBeenCalledWith(1)
  })

  it("健康检查失败时终止刚拉起的子进程、拒绝 start 且不触发 onExit", async () => {
    const child = fakeChild()
    forkMock.mockReturnValue(child)
    const onExit = vi.fn()
    const mgr = new ServerManager(
      "/fake/server.js",
      dir,
      onExit,
      async () => {
        throw new Error("health check timeout")
      },
      forkMock
    )
    await expect(
      mgr.start({ TURSO_DATABASE_URL: "file:test.db", SESSION_SECRET: "s" })
    ).rejects.toThrow("health check timeout")
    expect(child.kill).toHaveBeenCalled()
    expect(onExit).not.toHaveBeenCalled()
  })

  it("stop 终止子进程", async () => {
    const child = fakeChild()
    forkMock.mockReturnValue(child)
    const mgr = new ServerManager(
      "/fake/server.js",
      dir,
      vi.fn(),
      async () => {},
      forkMock
    )
    await mgr.start({ TURSO_DATABASE_URL: "file:test.db", SESSION_SECRET: "s" })
    mgr.stop()
    expect(child.kill).toHaveBeenCalled()
  })

  it("旧子进程延迟的 exit 不清掉新子进程引用，stop 仍能终止新子进程", async () => {
    const child1 = fakeChild()
    const child2 = fakeChild()
    forkMock.mockReturnValueOnce(child1).mockReturnValueOnce(child2)
    const onExit = vi.fn()
    const mgr = new ServerManager(
      "/fake/server.js",
      dir,
      onExit,
      async () => {},
      forkMock
    )
    await mgr.start({ TURSO_DATABASE_URL: "file:test.db", SESSION_SECRET: "s" })
    mgr.stop()
    await mgr.start({ TURSO_DATABASE_URL: "file:test.db", SESSION_SECRET: "s" })
    // 第一次 stop 的旧子进程的 exit 事件延迟到达（在新子进程启动之后）
    child1.emit("exit", 143)
    expect(onExit).toHaveBeenCalledWith(143)
    // 引用未被旧 exit 事件清掉：stop 应终止当前（新的）子进程
    mgr.stop()
    expect(child2.kill).toHaveBeenCalled()
  })
})
