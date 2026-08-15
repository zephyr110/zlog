import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const src = readFileSync(
  join(__dirname, "../../web/src/components/admin/traffic-analytics.tsx"),
  "utf8"
)

describe("traffic-analytics client imports", () => {
  it("不从 ga-analytics 拉 undici / node:net 进客户端", () => {
    expect(src).not.toMatch(/from\s+["']@\/lib\/ga-analytics["']/)
    expect(src).not.toMatch(/from\s+["']@\/lib\/analytics-proxy-env["']/)
    expect(src).toMatch(/from\s+["']@\/lib\/analytics-shared["']/)
  })
})
