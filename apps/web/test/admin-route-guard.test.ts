import { describe, expect, it } from "vitest"
import {
  isAdminPath,
  isAppRouterRscRequest,
  shouldRedirectAdminToLogin,
} from "@/lib/admin-route-guard"

describe("isAdminPath", () => {
  it("matches /admin and /admin/*", () => {
    expect(isAdminPath("/admin")).toBe(true)
    expect(isAdminPath("/admin/login")).toBe(true)
    expect(isAdminPath("/admin/posts/edit?slug=x")).toBe(true)
  })

  it("rejects public paths and look-alikes", () => {
    expect(isAdminPath("/")).toBe(false)
    expect(isAdminPath("/posts/hello")).toBe(false)
    expect(isAdminPath("/administrator")).toBe(false)
    expect(isAdminPath("/adminx")).toBe(false)
  })
})

describe("isAppRouterRscRequest", () => {
  it("detects RSC headers", () => {
    expect(isAppRouterRscRequest({ get: (n) => (n === "RSC" ? "1" : null) })).toBe(true)
    expect(
      isAppRouterRscRequest({ get: (n) => (n === "Next-Router-State-Tree" ? "x" : null) })
    ).toBe(true)
  })

  it("is false for plain document requests", () => {
    expect(isAppRouterRscRequest({ get: () => null })).toBe(false)
  })
})

describe("shouldRedirectAdminToLogin", () => {
  it("never redirects public pages or the login page", () => {
    expect(
      shouldRedirectAdminToLogin({ pathname: "/", hasUser: false, isRsc: false })
    ).toBe(false)
    expect(
      shouldRedirectAdminToLogin({ pathname: "/admin/login", hasUser: false, isRsc: false })
    ).toBe(false)
  })

  it("redirects an unauthenticated document navigation on admin pages", () => {
    expect(
      shouldRedirectAdminToLogin({ pathname: "/admin/dashboard", hasUser: false, isRsc: false })
    ).toBe(true)
  })

  it("does not redirect when the user is present", () => {
    expect(
      shouldRedirectAdminToLogin({ pathname: "/admin/dashboard", hasUser: true, isRsc: false })
    ).toBe(false)
  })

  it("does not redirect RSC navigations (layout handles them client-side)", () => {
    expect(
      shouldRedirectAdminToLogin({ pathname: "/admin/dashboard", hasUser: false, isRsc: true })
    ).toBe(false)
  })
})
