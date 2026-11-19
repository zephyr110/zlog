import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { skipStaticParamsAtBuild } from "@/lib/build-mode"

const keys = ["NEXT_DESKTOP", "ZLOG_BUILD_NO_DB"] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of keys) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of keys) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe("skipStaticParamsAtBuild", () => {
  it("正常构建枚举静态路径", () => {
    expect(skipStaticParamsAtBuild()).toBe(false)
  })

  it("桌面 standalone 构建无库，跳过", () => {
    process.env.NEXT_DESKTOP = "true"
    expect(skipStaticParamsAtBuild()).toBe(true)
  })

  it("线上构建预检降级时跳过", () => {
    process.env.ZLOG_BUILD_NO_DB = "1"
    expect(skipStaticParamsAtBuild()).toBe(true)
  })

  it("非确切的开关值不生效", () => {
    process.env.NEXT_DESKTOP = "1"
    process.env.ZLOG_BUILD_NO_DB = "true"
    expect(skipStaticParamsAtBuild()).toBe(false)
  })
})
