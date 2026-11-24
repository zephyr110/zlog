import { describe, it, expect } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  isSnapshotBuildEligible,
  shouldBuildFromSnapshot,
  snapshotBuildEnv,
  withSnapshotCopy,
} from "../scripts/build-snapshot.mjs"

const siteEnv = {
  VERCEL: "1",
  VERCEL_GIT_REPO_OWNER: "zephyr110",
  VERCEL_GIT_REPO_SLUG: "zlog",
}

describe("快照构建的适用范围", () => {
  it("桌面端构建永不用快照", () => {
    expect(isSnapshotBuildEligible({ NEXT_DESKTOP: "true" })).toBe(false)
  })

  it("本地构建可用（站长自己的机器）", () => {
    expect(isSnapshotBuildEligible({})).toBe(true)
  })

  it("本站 Vercel Git 构建可用", () => {
    expect(isSnapshotBuildEligible(siteEnv)).toBe(true)
  })

  it("桌面一键部署（upload deployment，无 Git 信息）不可用", () => {
    expect(isSnapshotBuildEligible({ VERCEL: "1" })).toBe(false)
  })

  it("别人 fork 的 Vercel 构建不可用", () => {
    expect(isSnapshotBuildEligible({ ...siteEnv, VERCEL_GIT_REPO_OWNER: "someone" })).toBe(false)
  })
})

describe("何时改吃快照", () => {
  const base = { snapshotExists: true, env: {} }

  it("远端不可用时用快照", () => {
    expect(shouldBuildFromSnapshot({ ...base, status: "unavailable" })).toBe(true)
  })

  it("没有快照时退回原逻辑", () => {
    expect(shouldBuildFromSnapshot({ status: "unavailable", snapshotExists: false, env: {} })).toBe(false)
  })

  it("Vercel 上没配库（通常是 Preview）用快照", () => {
    expect(shouldBuildFromSnapshot({ status: "missing", snapshotExists: true, env: siteEnv })).toBe(
      true
    )
  })

  it("本地没配库保持原行为，不用快照", () => {
    expect(shouldBuildFromSnapshot({ status: "missing", snapshotExists: true, env: {} })).toBe(false)
  })

  it("库正常时不用快照", () => {
    expect(shouldBuildFromSnapshot({ ...base, status: "ok" })).toBe(false)
  })

  it("配置错误仍失败，不用快照掩盖", () => {
    expect(shouldBuildFromSnapshot({ ...base, status: "config-error" })).toBe(false)
  })

  it("桌面一键部署不拿站长快照渲染用户站点", () => {
    expect(
      shouldBuildFromSnapshot({
        ...base,
        status: "unavailable",
        env: { VERCEL: "1" },
      })
    ).toBe(false)
  })
})

describe("snapshotBuildEnv", () => {
  it("改指本地快照并断开远端鉴权/同步", () => {
    const base = {
      TURSO_DATABASE_URL: "libsql://remote",
      TURSO_AUTH_TOKEN: "token",
      TURSO_SYNC_URL: "libsql://sync",
      TURSO_SYNC_INTERVAL: "300",
      ZLOG_BUILD_NO_DB: "1",
      KEEP: "1",
    }
    const env = snapshotBuildEnv(base, "/tmp/snap.sqlite")
    expect(env.TURSO_DATABASE_URL).toBe("file:/tmp/snap.sqlite")
    for (const key of [
      "TURSO_AUTH_TOKEN",
      "TURSO_SYNC_URL",
      "TURSO_SYNC_INTERVAL",
      "ZLOG_BUILD_NO_DB",
    ]) {
      expect(env[key]).toBeUndefined()
    }
    expect(env.KEEP).toBe("1")
    expect(base.TURSO_DATABASE_URL).toBe("libsql://remote")
  })
})

describe("withSnapshotCopy", () => {
  it("在临时副本上操作，结束后清理且不动源文件", () => {
    const dir = mkdtempSync(join(tmpdir(), "zlog-snapshot-src-"))
    const source = join(dir, "snap.sqlite")
    writeFileSync(source, "snapshot-bytes")
    let seen: string | undefined
    try {
      const result = withSnapshotCopy(source, (path: string) => {
        seen = path
        expect(path).not.toBe(source)
        expect(readFileSync(path, "utf8")).toBe("snapshot-bytes")
        return "done"
      })
      expect(result).toBe("done")
      expect(seen && existsSync(seen)).toBe(false)
      expect(readFileSync(source, "utf8")).toBe("snapshot-bytes")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("回调抛错也会清理临时目录", () => {
    const dir = mkdtempSync(join(tmpdir(), "zlog-snapshot-src-"))
    const source = join(dir, "snap.sqlite")
    writeFileSync(source, "snapshot-bytes")
    let seen: string | undefined
    try {
      expect(() =>
        withSnapshotCopy(source, (path: string) => {
          seen = path
          throw new Error("boom")
        })
      ).toThrow("boom")
      expect(seen && existsSync(seen)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
