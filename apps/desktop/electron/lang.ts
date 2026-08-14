import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/**
 * 桌面端语言：单一事实源是 userData/lang.json，内容为
 * { pref: "system" | "zh" | "en", resolved: "zh" | "en" }。
 *
 * - pref 是用户偏好（设置窗口三态下拉），默认 "system"（跟随系统语言）
 * - resolved 是实际生效语言：pref !== "system" 时等于 pref，否则由
 *   系统语言解析（zh* → zh；其余（含非中英）→ en）
 *
 * 放在独立文件而非 zlog-config.json：博客/admin 窗口因安全原因不挂
 * preload（会暴露密钥），web 端经 /api/lang 直接读这个文件接入同一
 * 语言源——config 里全是敏感字段，不能交给 web server 读取。
 */
export type LangPref = "system" | "zh" | "en"
export type ResolvedLang = "zh" | "en"

export interface LangState {
  pref: LangPref
  resolved: ResolvedLang
}

export function isLangPref(v: unknown): v is LangPref {
  return v === "system" || v === "zh" || v === "en"
}

/** 解析生效语言：显式偏好优先；system 由系统 locale 前缀判定（仅中/英，其余回落 en）。 */
export function resolveLang(pref: LangPref, systemLocale: string): ResolvedLang {
  if (pref !== "system") return pref
  return systemLocale.startsWith("zh") ? "zh" : "en"
}

/** 读写 lang.json。路径注入便于测试（主进程传 userData 目录）。 */
export class LangFile {
  constructor(private readonly dir: string) {}

  get filePath(): string {
    return join(this.dir, "lang.json")
  }

  load(): LangState | null {
    if (!existsSync(this.filePath)) return null
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<LangState>
      if (!isLangPref(raw.pref) || (raw.resolved !== "zh" && raw.resolved !== "en")) {
        return null
      }
      return raw as LangState
    } catch {
      return null
    }
  }

  save(state: LangState): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    // 原子写（tmp + rename）：主进程与 web server（/api/lang）都可能写
    // 本文件，直接 writeFileSync 的截断写会让并发读方读到半截 JSON；
    // rename 对读者是原子的——读到的是旧值或新值，不会是撕裂内容。
    // tmp 名带 pid：两个写入进程（主进程 / Next server 子进程）若共用
    // 固定名，A 写完 tmp 后 B 截断重写，A 的 rename 会搬入 B 的半截内容。
    const tmp = `${this.filePath}.tmp-${process.pid}`
    writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 })
    renameSync(tmp, this.filePath)
  }

  /**
   * 读取当前状态；文件缺失/损坏时按给定系统语言重建（默认跟随系统）。
   * 每次调用都读盘、不缓存——设置窗口与 web 端（/api/lang）可能各自
   * 写入，缓存会让另一端读到过期值。
   * 写盘失败（目录只读等）不抛出：语言偏好尽力而为，坏了默认 zh，
   * 不能让整个 app 启动失败。
   */
  loadOrInit(systemLocale: string): LangState {
    // 上次崩溃可能留下 write+rename 之间的半成品 tmp（旧 pid 后缀），
    // 启动时顺手清掉，避免 userData 里堆积未校验的垃圾文件
    try {
      for (const f of readdirSync(this.dir).filter((f) => f.startsWith("lang.json.tmp-"))) {
        try {
          unlinkSync(join(this.dir, f))
        } catch {
          // 清不掉不影响正确性（rename 覆盖旧值）
        }
      }
    } catch {
      // 目录不存在/不可读：跳过清理，load 自会处理
    }
    const existing = this.load()
    if (existing) return existing
    const state: LangState = {
      pref: "system",
      resolved: resolveLang("system", systemLocale),
    }
    try {
      this.save(state)
    } catch {
      // 读不到也写不了：返回默认状态，调用方照常渲染
    }
    return state
  }

  /** 更新偏好并重算生效语言；返回写盘后的状态。写盘失败不抛（尽力而为）。 */
  setPref(pref: LangPref, systemLocale: string): LangState {
    const state: LangState = { pref, resolved: resolveLang(pref, systemLocale) }
    try {
      this.save(state)
    } catch {
      // 写盘失败：本次会话仍按新语言渲染，重启后回落磁盘旧值
    }
    return state
  }
}
