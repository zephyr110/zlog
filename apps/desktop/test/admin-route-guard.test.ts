import { describe, it, expect } from "vitest"
import {
  isAdminPath,
  isAppRouterRscRequest,
  shouldRedirectAdminToLogin,
} from "../../web/src/lib/admin-route-guard"

describe("shouldRedirectAdminToLogin", () => {
  it("公开页和登录页不跳", () => {
    expect(
      shouldRedirectAdminToLogin({ pathname: "/", hasUser: false, isRsc: false })
    ).toBe(false)
    expect(
      shouldRedirectAdminToLogin({
        pathname: "/admin/login",
        hasUser: false,
        isRsc: false,
      })
    ).toBe(false)
  })

  it("isAdminPath 不把 /administration 当成后台", () => {
    expect(isAdminPath("/admin")).toBe(true)
    expect(isAdminPath("/admin/dashboard")).toBe(true)
    expect(isAdminPath("/administration")).toBe(false)
    expect(isAdminPath("/adminish")).toBe(false)
  })

  it("不以 /admin 为前缀的路径不跳，即使以 admin 开头", () => {
    expect(
      shouldRedirectAdminToLogin({
        pathname: "/administration",
        hasUser: false,
        isRsc: false,
      })
    ).toBe(false)
    expect(
      shouldRedirectAdminToLogin({
        pathname: "/adminish",
        hasUser: false,
        isRsc: false,
      })
    ).toBe(false)
  })

  it("已登录不跳", () => {
    expect(
      shouldRedirectAdminToLogin({
        pathname: "/admin/dashboard",
        hasUser: true,
        isRsc: false,
      })
    ).toBe(false)
  })

  it("整页打开未登录后台时跳登录", () => {
    expect(
      shouldRedirectAdminToLogin({
        pathname: "/admin",
        hasUser: false,
        isRsc: false,
      })
    ).toBe(true)
    expect(
      shouldRedirectAdminToLogin({
        pathname: "/admin/dashboard",
        hasUser: false,
        isRsc: false,
      })
    ).toBe(true)
  })

  it("RSC 导航未带 cookie 时不 302，避免 Next 全局错误页", () => {
    expect(
      shouldRedirectAdminToLogin({
        pathname: "/admin/dashboard",
        hasUser: false,
        isRsc: true,
      })
    ).toBe(false)
  })
})

describe("isAppRouterRscRequest", () => {
  it("认 RSC / Next-Router-State-Tree", () => {
    expect(isAppRouterRscRequest({ get: (n) => (n === "RSC" ? "1" : null) })).toBe(
      true
    )
    expect(
      isAppRouterRscRequest({
        get: (n) => (n === "Next-Router-State-Tree" ? "%5B%5D" : null),
      })
    ).toBe(true)
    expect(isAppRouterRscRequest({ get: () => null })).toBe(false)
  })
})
