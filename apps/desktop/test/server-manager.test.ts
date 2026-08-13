import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock("node:child_process", () => ({ spawn: spawnMock }))

import { ServerManager } from "../electron/server-manager"

function fakeChild() {
  const events: Record<string, Function[]> = {}
  return {
    stdout: { on: vi.fn((ev, cb) => cb?.("stdout-data")) },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
    on: (ev: string, cb: Function) => { events[ev] = [...(events[ev] || []), cb] },
    emit: (ev: string, ...args: unknown[]) => (events[ev] || []).forEach((cb) => cb(...args)),
  }
}

describe("ServerManager", () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "zlog-srv-"))
    spawnMock.mockReset()
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

  it("start 以 ELECTRON_RUN_AS_NODE 拉起服务器并绑定 127.0.0.1", async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const onExit = vi.fn()
    const mgr = new ServerManager("/fake/server.js", dir, onExit, async () => {})
    await mgr.start({ TURSO_DATABASE_URL: "file:test.db", SESSION_SECRET: "s" })
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [bin, args, opts] = spawnMock.mock.calls[0]
    expect(bin).toBe(process.execPath)
    expect(args).toEqual(["/fake/server.js"])
    expect(opts.env.ELECTRON_RUN_AS_NODE).toBe("1")
    expect(opts.env.HOSTNAME).toBe("127.0.0.1")
    expect(Number(opts.env.PORT)).toBeGreaterThan(0)
    expect(mgr.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  it("服务器退出触发 onExit 回调", async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const onExit = vi.fn()
    const mgr = new ServerManager("/fake/server.js", dir, onExit, async () => {})
    await mgr.start({ TURSO_DATABASE_URL: "file:test.db", SESSION_SECRET: "s" })
    child.emit("exit", 1)
    expect(onExit).toHaveBeenCalledWith(1)
  })

  it("stop 终止子进程", async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const mgr = new ServerManager("/fake/server.js", dir, vi.fn(), async () => {})
    await mgr.start({ TURSO_DATABASE_URL: "file:test.db", SESSION_SECRET: "s" })
    mgr.stop()
    expect(child.kill).toHaveBeenCalled()
  })

  it("旧子进程延迟的 exit 不清掉新子进程引用，stop 仍能终止新子进程", async () => {
    const child1 = fakeChild()
    const child2 = fakeChild()
    spawnMock.mockReturnValueOnce(child1).mockReturnValueOnce(child2)
    const onExit = vi.fn()
    const mgr = new ServerManager("/fake/server.js", dir, onExit, async () => {})
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
