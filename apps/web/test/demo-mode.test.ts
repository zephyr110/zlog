import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { isDemoMode } from "@/lib/demo-mode"

const keys = ["NEXT_PUBLIC_DEMO_MODE", "DEMO_MODE"] as const
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

describe("isDemoMode", () => {
  it("is false by default", () => {
    expect(isDemoMode()).toBe(false)
  })

  it("honors NEXT_PUBLIC_DEMO_MODE (client build-time inline)", () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true"
    expect(isDemoMode()).toBe(true)
  })

  it("honors DEMO_MODE (server-side)", () => {
    process.env.DEMO_MODE = "true"
    expect(isDemoMode()).toBe(true)
  })

  it("is false for non-true values", () => {
    process.env.DEMO_MODE = "1"
    expect(isDemoMode()).toBe(false)
    process.env.NEXT_PUBLIC_DEMO_MODE = "TRUE"
    expect(isDemoMode()).toBe(false)
  })
})
