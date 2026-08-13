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
  // createWriteStream 的 fs.open 是异步的：先让事件循环排空未决的打开/写回调，再删临时目录，
  // 否则删除后到达的 open 会抛出未捕获的 ENOENT
  afterEach(async () => {
    await new Promise((resolve) => setImmediate(resolve))
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
})
