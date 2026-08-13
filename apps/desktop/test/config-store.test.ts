import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigStore, type DesktopConfig } from "../electron/config-store"

function validConfig(): DesktopConfig {
  return {
    adminUsername: "admin",
    adminPasswordHash: "$2b$10$abc",
    sessionSecret: "secret",
    desktopKey: "key-123",
    syncUrl: "libsql://example.turso.io",
    syncToken: "token",
  }
}

describe("ConfigStore", () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "zlog-cfg-")) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("文件不存在时 load 返回 null", () => {
    expect(new ConfigStore(dir).load()).toBeNull()
  })

  it("save 后 load 往返一致", () => {
    const store = new ConfigStore(dir)
    store.save(validConfig())
    expect(store.load()).toEqual(validConfig())
  })

  it("损坏的 JSON 返回 null", () => {
    writeFileSync(join(dir, "zlog-config.json"), "{not json")
    expect(new ConfigStore(dir).load()).toBeNull()
  })

  it("缺关键字段视为未配置", () => {
    writeFileSync(join(dir, "zlog-config.json"), JSON.stringify({ adminUsername: "x" }))
    expect(new ConfigStore(dir).load()).toBeNull()
  })

  it("save 在 POSIX 上写 0600 权限", () => {
    if (process.platform === "win32") return
    const store = new ConfigStore(dir)
    store.save(validConfig())
    const { mode } = require("node:fs").statSync(store.filePath)
    expect(mode & 0o777).toBe(0o600)
  })
})
