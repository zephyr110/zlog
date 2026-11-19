import { describe, expect, it } from "vitest"
import { isDatabaseUnavailable } from "../scripts/db-availability.mjs"

function failure(message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), extra)
}

describe("isDatabaseUnavailable", () => {
  it("Turso 配额封禁（BLOCKED）视为不可用", () => {
    const error = failure(
      "BLOCKED: SQL read operations are forbidden (reads are blocked)",
      { code: "BLOCKED" }
    )
    expect(isDatabaseUnavailable(error)).toBe(true)
  })

  it("识别嵌套在 cause 里的封禁错误", () => {
    const cause = failure("Operation was blocked", { code: "BLOCKED" })
    expect(isDatabaseUnavailable(failure("Sync(PullFrame(...))", { cause }))).toBe(true)
  })

  it("网络错误视为不可用", () => {
    expect(isDatabaseUnavailable(failure("fetch failed"))).toBe(true)
    expect(isDatabaseUnavailable(failure("connect ECONNREFUSED 127.0.0.1:9"))).toBe(true)
    expect(isDatabaseUnavailable(failure("getaddrinfo ENOTFOUND example.turso.io"))).toBe(true)
  })

  it("探测超时视为不可用", () => {
    expect(
      isDatabaseUnavailable(failure("probe timed out after 10000ms", { code: "PROBE_TIMEOUT" }))
    ).toBe(true)
  })

  it("鉴权/配置错误不算不可用——必须让构建失败", () => {
    expect(isDatabaseUnavailable(failure("AUTH: token expired", { code: "AUTH" }))).toBe(false)
    expect(
      isDatabaseUnavailable(failure("URL_INVALID: unsupported URL", { code: "URL_INVALID" }))
    ).toBe(false)
  })
})
