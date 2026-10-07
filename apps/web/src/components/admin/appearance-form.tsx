"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { useSiteConfig } from "@/components/layout/site-config-provider"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import {
  BASE_COLORS,
  THEME_COLORS,
  DEFAULT_BASE_COLOR,
  DEFAULT_THEME_COLOR,
  isBaseColorName,
  isThemeColorName,
  type BaseColorName,
  type ThemeColorName,
} from "@/lib/theme-catalog"

/**
 * 「外观」面板 — 基准色 × 主题色（accent）。
 *
 * 活预览为元素级作用域，不依赖 ambient html：
 * - 基准色按钮只挂自身 data-base-color——色块恒为本基准色身份（背景/边框/
 *   primary 圆点），不随主题色选择变化。切勿再挂 data-theme-color：accent
 *   段源序在 base 段之后，同特异性下会把 --primary 圆点劫持成当前主题色。
 * - 主题色按钮挂 data-base-color={当前基准} + data-theme-color={本项}——圆点
 *   取本主题 accent（同特异性、accent 段靠后取胜），边框等中性上下文取当前
 *   基准色；Default 无 accent 块 → 落回基准色自身主色，Neutral 落到与 :root
 *   等值的 neutral 块。亮暗随面板所处模式自适应（.dark 后代形态）。
 */
export function AppearanceForm({ className }: { className?: string }) {
  const { t } = useT()
  const router = useRouter()
  const site = useSiteConfig()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [baseColor, setBaseColor] = useState<BaseColorName>(DEFAULT_BASE_COLOR)
  const [themeColor, setThemeColor] =
    useState<ThemeColorName>(DEFAULT_THEME_COLOR)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/site-settings")
        if (!res.ok) throw new Error("failed")
        const data = await res.json()
        if (cancelled) return
        const s = data.settings
        if (isBaseColorName(s.baseColor)) setBaseColor(s.baseColor)
        if (isThemeColorName(s.themeColor)) setThemeColor(s.themeColor)
      } catch {
        if (!cancelled) {
          // 同 site-info-form：加载失败不静默回退——提示并退回上下文值。
          toast.error(t("admin.appearanceLoadFailed"))
          if (isBaseColorName(site.baseColor)) setBaseColor(site.baseColor)
          if (isThemeColorName(site.themeColor)) setThemeColor(site.themeColor)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // Initial hydrate only — site context is a fallback.（同 site-info-form）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      // 仅两字段：upsert 为局部合并，不会碰站点信息字段。
      const res = await apiFetch("/api/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseColor, themeColor }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || t("admin.appearanceSaveFailed"))
        return
      }
      toast.success(t("admin.appearanceSaved"))
      // 同步上下文（同 site-info-form 保存后范式）：刷新链路走 SSR 属性，
      // 但 context 仍是页面加载时的旧值——若此后面板重开且 GET 瞬时失败，
      // 回退分支会把过期上下文填进表单，管理员顺手保存即静默回退配色。
      const s = data.settings
      site.setSiteConfig((prev) => ({
        ...prev,
        baseColor: isBaseColorName(s.baseColor) ? s.baseColor : prev.baseColor,
        themeColor: isThemeColorName(s.themeColor)
          ? s.themeColor
          : prev.themeColor,
      }))
      // 根布局重渲染 → <html> 属性更新 → 全站即时换色。
      router.refresh()
    } catch {
      toast.error(t("admin.networkError"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div
        className={cn(
          "flex min-h-[10rem] items-center justify-center",
          className
        )}
      >
        <Spinner size="md" />
      </div>
    )
  }

  return (
    <div className={cn("space-y-5", className)}>
      <div className="space-y-2.5">
        <Label>{t("admin.appearanceBaseColor")}</Label>
        <div
          role="group"
          aria-label={t("admin.appearanceBaseColor")}
          className="grid grid-cols-5 gap-2"
        >
          {BASE_COLORS.map((c) => {
            const selected = baseColor === c.id
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected}
                data-base-color={c.id}
                onClick={() => setBaseColor(c.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-2 text-[11px] leading-none transition-colors",
                  selected
                    ? "border-ring text-foreground ring-2 ring-ring"
                    : "border-border text-muted-foreground hover:border-muted-foreground/50"
                )}
              >
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-md border"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: "var(--primary)" }}
                  />
                </span>
                <span>{c.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2.5">
        <Label>{t("admin.appearanceThemeColor")}</Label>
        <div
          role="group"
          aria-label={t("admin.appearanceThemeColor")}
          className="grid grid-cols-4 gap-2 sm:grid-cols-8"
        >
          {THEME_COLORS.map((c) => {
            const selected = themeColor === c.id
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected}
                data-base-color={baseColor}
                data-theme-color={c.id}
                onClick={() => setThemeColor(c.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-2 text-[11px] leading-none transition-colors",
                  selected
                    ? "border-ring text-foreground ring-2 ring-ring"
                    : "border-border text-muted-foreground hover:border-muted-foreground/50"
                )}
              >
                <span
                  aria-hidden
                  className="size-6 rounded-full border"
                  style={{
                    backgroundColor: "var(--primary)",
                    borderColor: "var(--border)",
                  }}
                />
                <span>{c.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("admin.appearanceHint")}</p>

      <Button type="button" onClick={handleSave} disabled={saving}>
        {saving ? t("admin.saving") : t("admin.appearanceSave")}
      </Button>
    </div>
  )
}
