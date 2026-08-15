import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LangFile, resolveLang, isLangPref } from "../electron/lang"
import { isDesktopLangSource } from "../../web/src/lib/desktop-lang-source"

describe("resolveLang", () => {
  it("显式偏好优先于系统语言", () => {
    expect(resolveLang("zh", "en-US")).toBe("zh")
    expect(resolveLang("en", "zh-CN")).toBe("en")
  })

  it("system 由系统语言前缀解析", () => {
    expect(resolveLang("system", "zh-CN")).toBe("zh")
    expect(resolveLang("system", "zh-Hant-TW")).toBe("zh")
    expect(resolveLang("system", "zh")).toBe("zh")
    expect(resolveLang("system", "en-US")).toBe("en")
    expect(resolveLang("system", "en")).toBe("en")
  })

  it("非中英系统语言一律回落英文", () => {
    for (const locale of ["ja-JP", "fr-FR", "de", "ko-KR", "es-MX", "ru"]) {
      expect(resolveLang("system", locale)).toBe("en")
    }
  })
})

describe("isDesktopLangSource", () => {
  it("有 DESKTOP_LANG_FILE 即桌面源，不因文件尚未落盘当成 web", () => {
    expect(isDesktopLangSource("/data/userData/lang.json")).toBe(true)
    expect(isDesktopLangSource(null)).toBe(false)
    expect(isDesktopLangSource(undefined)).toBe(false)
    expect(isDesktopLangSource("")).toBe(false)
  })
})

describe("isLangPref", () => {
  it("只接受三态值", () => {
    expect(isLangPref("system")).toBe(true)
    expect(isLangPref("zh")).toBe(true)
    expect(isLangPref("en")).toBe(true)
    expect(isLangPref("fr")).toBe(false)
    expect(isLangPref(undefined)).toBe(false)
    expect(isLangPref(null)).toBe(false)
  })
})

describe("LangFile", () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "zlog-lang-"))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("文件缺失时初始化跟随系统（默认 system）并落盘", () => {
    const lf = new LangFile(dir)
    const state = lf.loadOrInit("zh-TW")
    expect(state).toEqual({ pref: "system", resolved: "zh" })
    expect(JSON.parse(readFileSync(join(dir, "lang.json"), "utf8"))).toEqual(state)
  })

  it("损坏文件回落重建而非抛错", () => {
    const lf = new LangFile(dir)
    lf.save({ pref: "system", resolved: "zh" })
    // 覆盖为非法 JSON
    writeFileSync(join(dir, "lang.json"), "{not json")
    expect(lf.load()).toBeNull()
    expect(lf.loadOrInit("en-US").resolved).toBe("en")
  })

  it("setPref 重算 resolved 并写盘；显式偏好覆盖 system", () => {
    const lf = new LangFile(dir)
    lf.loadOrInit("fr-FR")
    expect(lf.loadOrInit("fr-FR").resolved).toBe("en")

    const zh = lf.setPref("zh", "fr-FR")
    expect(zh).toEqual({ pref: "zh", resolved: "zh" })
    // 切回 system 后重新按系统语言解析
    expect(lf.setPref("system", "fr-FR")).toEqual({ pref: "system", resolved: "en" })
  })

  it("每次读盘（不缓存）——web 端 /api/lang 写入后设置窗口读到新值", () => {
    const lf = new LangFile(dir)
    lf.loadOrInit("en-US")
    writeFileSync(join(dir, "lang.json"), JSON.stringify({ pref: "zh", resolved: "zh" }))
    expect(lf.load()).toEqual({ pref: "zh", resolved: "zh" })
  })
})

describe("/api/lang desktop 探测", () => {
  it("文件尚未落盘时仍标 desktop，避免界面停 POST", () => {
    const src = readFileSync(
      join(__dirname, "../../web/src/app/api/lang/route.ts"),
      "utf8"
    )
    expect(src).toContain("isDesktopLangSource")
    expect(src).toMatch(/desktop:\s*true/)
  })
})
