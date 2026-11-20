import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(__dirname, "..")
const html = readFileSync(join(ROOT, "renderer/settings.html"), "utf8")
const js = readFileSync(join(ROOT, "renderer/settings.js"), "utf8")

function dictKeys(block: string): string[] {
  return [...block.matchAll(/"([^"]+)":/g)].map((m) => m[1])
}

function dictValues(block: string): string[] {
  return [...block.matchAll(/": "((?:\\.|[^"\\])*)"/g)].map((m) =>
    m[1].replace(/\\"/g, '"')
  )
}

function parseI18n(): { zh: string[]; en: string[] } {
  const zh = js.match(/zh: \{([\s\S]*?)\n  \},\n  en:/)
  const en = js.match(/en: \{([\s\S]*?)\n  \},\n\}/)
  if (!zh || !en) throw new Error("failed to parse I18N dictionaries in settings.js")
  return { zh: dictKeys(zh[1]), en: dictKeys(en[1]) }
}

describe("settings i18n coverage", () => {
  const { zh, en } = parseI18n()
  const htmlKeys = [...html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map((m) => m[1])

  it("zh / en 字典 key 一一对应", () => {
    expect([...zh].sort()).toEqual([...en].sort())
  })

  it("文案末尾不加句号", () => {
    const zhBlock = js.match(/zh: \{([\s\S]*?)\n  \},\n  en:/)![1]
    const enBlock = js.match(/en: \{([\s\S]*?)\n  \},\n\}/)![1]
    for (const value of [...dictValues(zhBlock), ...dictValues(enBlock)]) {
      expect(value, JSON.stringify(value)).not.toMatch(/[。.]$/)
    }
  })

  it("HTML 的 data-i18n 都在中英字典里", () => {
    const missingZh = htmlKeys.filter((k) => !zh.includes(k))
    const missingEn = htmlKeys.filter((k) => !en.includes(k))
    expect(missingZh, `missing in zh: ${missingZh.join(", ")}`).toEqual([])
    expect(missingEn, `missing in en: ${missingEn.join(", ")}`).toEqual([])
  })

  it("侧栏导航都挂了 data-i18n，避免语言切换后残留中文", () => {
    for (const key of [
      "nav.sync",
      "nav.analytics",
      "nav.comments",
      "nav.publish",
      "nav.data",
      "nav.lang",
      "nav.about",
    ]) {
      expect(html).toContain(`data-i18n="${key}"`)
      expect(zh).toContain(key)
      expect(en).toContain(key)
    }
  })

  it("侧栏顺序：线上部署在同步设置之后", () => {
    const nav = html.match(/<nav class="sidebar-nav">([\s\S]*?)<\/nav>/)![1]
    const panels = [...nav.matchAll(/data-panel="([^"]+)"/g)].map((m) => m[1])
    expect(panels).toEqual(["sync", "publish", "analytics", "comments", "data", "lang", "about"])
  })

  it("各面板内容区用浅底 .block 分组，流量拆成 Vercel / GA", () => {
    for (const id of [
      "panel-sync",
      "panel-analytics",
      "panel-comments",
      "panel-publish",
      "panel-data",
      "panel-lang",
      "panel-about",
    ]) {
      expect(html).toMatch(new RegExp(`id="${id}"[\\s\\S]*?class="block`))
    }
    expect(html).toContain('data-i18n="analytics.vercelTitle"')
    expect(html).toContain('data-i18n="analytics.gaTitle"')
    expect(html.match(/id="panel-analytics"[\s\S]*?id="panel-data"/)![0].match(/class="block"/g)?.length).toBe(4)
    expect(html).toContain('id="httpsProxy"')
    expect(html).toContain('data-i18n="analytics.proxyTitle"')
    expect(html).toContain('data-i18n="analytics.proxyHint"')
    expect(html).not.toContain("analytics.proxyLabel")
    expect(js).not.toContain("analytics.proxyLabel")
    expect(html).not.toContain("langHeading")
    expect(html).not.toContain("lang.label")
    expect(js).not.toContain("lang.label")
    expect(zh).toContain("about.noRelease")
    expect(en).toContain("about.noRelease")
    expect(zh).toContain("about.checkUnavailable")
    expect(en).toContain("about.checkUnavailable")
    expect(js).toContain('res?.error === "not_found"')
    expect(js).toContain('res?.error === "network"')
    expect(js).toContain('get("panel")')
    expect(js).toContain("onShowPanel")
    expect(js).toContain("zlogApi?.loadConfig")
    expect(html).not.toContain("about-group")
    expect(html).not.toContain("data-card")
    expect(html).toContain('id="openBtn2"')
    expect(html).toContain('data-i18n="data.location"')
    expect(html).toContain('data-i18n="data.backupHint"')
    expect(html).toContain('class="group"')
    expect(html).toMatch(/class="block-title"[^>]*>[\s\S]*?class="block"/)
    expect(html).toContain('class="about-line"')
    expect(html).toContain('data-i18n="analytics.vercelTeamIdNote"')
    expect(html).toMatch(/about-link-ext[\s\S]*?data-i18n="publish.step1Link"/)
    expect(html).toMatch(/about-link-ext[\s\S]*?data-i18n="publish.step2Link"/)
    expect(html).toMatch(/about-link-ext[\s\S]*?data-i18n="sync.helpSignupLink"/)
    expect(html).toMatch(/about-link-ext[\s\S]*?data-i18n="sync.helpGuide"/)
    expect(html).toMatch(/about-link-ext[\s\S]*?data-i18n="sync.helpTokenDoc"/)
    expect(html).not.toMatch(/<a[^>]*data-i18n="publish.step1Link"/)
    expect(html).not.toMatch(/<a[^>]*data-i18n="publish.step2Link"/)
    expect(html).not.toMatch(/<a[^>]*data-i18n="sync.helpSignupLink"/)
    expect(html).not.toMatch(/<a[^>]*data-i18n="sync.helpGuide"/)
    expect(html).not.toMatch(/<a[^>]*data-i18n="sync.helpTokenDoc"/)
    expect(html).not.toMatch(/<div class="select-item"[^>]*data-i18n=/)
    expect(html).toContain('class="guide-step-row"')
    expect(html).not.toContain("guide-step-head")
  })

  it("英文侧栏文案不含汉字，且短到单行放得下", () => {
    const enBlock = js.match(/en: \{([\s\S]*?)\n  \},\n\}/)![1]
    const nav: Record<string, string> = {}
    for (const m of enBlock.matchAll(/"(nav\.[^"]+)": "([^"]*)"/g)) {
      nav[m[1]] = m[2]
    }
    for (const [key, value] of Object.entries(nav)) {
      expect(value, key).not.toMatch(/[\u4e00-\u9fff]/)
      expect(value.length, `${key}="${value}" too long for 208px sidebar`).toBeLessThanOrEqual(12)
    }
  })
})

function inputTag(id: string): string {
  const m = html.match(new RegExp(`<input[^>]*\\sid="${id}"[^>]*>`))
  return m?.[0] ?? ""
}

describe("settings secret fields", () => {
  const secrets = ["password", "password2", "syncToken", "vercelApiToken", "gaPrivateKey"]
  const identifiers = [
    "username",
    "syncUrl",
    "vercelProjectId",
    "vercelTeamId",
    "gaPropertyId",
    "gaClientEmail",
    "httpsProxy",
  ]

  it("密钥默认 password，并带 eye 切换（不挂 data-i18n，避免 applyLang 清掉图标）", () => {
    const { zh, en } = parseI18n()
    expect(zh).toContain("secret.show")
    expect(zh).toContain("secret.hide")
    expect(en).toContain("secret.show")
    expect(en).toContain("secret.hide")
    for (const id of secrets) {
      expect(inputTag(id), id).toMatch(/type="password"/)
      expect(html).toContain(`class="secret-toggle" aria-controls="${id}"`)
    }
  })

  it("标识符保持明文，不套 eye", () => {
    for (const id of identifiers) {
      expect(inputTag(id), id).not.toMatch(/type="password"/)
      expect(html).not.toContain(`aria-controls="${id}"`)
    }
  })
})
