"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminBlockEmpty } from "@/components/admin/admin-block-empty"
import { useT } from "@/components/layout/trans"
import { apiFetch } from "@/lib/api-client"
import { type AnalyticsSource } from "@/lib/analytics-shared"
import {
  sparklinePoints,
  type PostTrafficReport,
} from "@/lib/post-traffic"

type MonthsWindow = "6" | "12" | "all"

const SPARK_W = 88
const SPARK_H = 24

/** Per-post traffic attribution — top posts by archived views over the
 *  selected window, each with a monthly sparkline. Self-fetching panel;
 *  renders nothing when no analytics source is configured (the main
 *  Traffic section already explains that state). */
export function PostTrafficPanel() {
  const { t } = useT()
  const [source, setSource] = useState<AnalyticsSource>("vercel")
  const [months, setMonths] = useState<MonthsWindow>("6")
  const [report, setReport] = useState<PostTrafficReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      // 与 TrafficAnalytics 同款：切源/切窗口先回 skeleton，避免慢请求
      // 期间静默展示过期窗口的旧数据。（setState 在 async 函数内，
      // 不在 effect 同步段——react-hooks/set-state-in-effect 要求。）
      setLoading(true)
      setError(false)
      setNotConfigured(false)
      try {
        const res = await apiFetch(
          `/api/admin/post-traffic?source=${source}&months=${months}`,
          { signal: controller.signal, skipAuthRedirect: true }
        )
        if (!res.ok) {
          if (res.status === 503) setNotConfigured(true)
          else setError(true)
          return
        }
        setReport((await res.json()) as PostTrafficReport)
      } catch (err) {
        // Abort 是正常的切换清理，不当作错误
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(true)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [source, months])

  if (notConfigured) return null

  const monthsLabel =
    months === "6"
      ? t("admin.postTrafficMonths6")
      : months === "12"
        ? t("admin.postTrafficMonths12")
        : t("admin.postTrafficMonthsAll")
  const sourceLabel =
    source === "vercel"
      ? t("admin.analyticsSourceVercel")
      : t("admin.analyticsSourceGa")

  const entries = report?.posts ?? []

  return (
    <Card className="gap-2 [--card-spacing:--spacing(4)]">
      <CardHeader>
        <CardTitle className="text-base">{t("admin.postTraffic")}</CardTitle>
        <CardDescription>{t("admin.postTrafficDesc")}</CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <Select
              value={source}
              onValueChange={(v) => setSource(v as AnalyticsSource)}
            >
              <SelectTrigger size="sm" className="w-36">
                <SelectValue>{sourceLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="vercel">
                  {t("admin.analyticsSourceVercel")}
                </SelectItem>
                <SelectItem value="ga">
                  {t("admin.analyticsSourceGa")}
                </SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={months}
              onValueChange={(v) => setMonths(v as MonthsWindow)}
            >
              <SelectTrigger size="sm" className="w-28">
                <SelectValue>{monthsLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="6">
                  {t("admin.postTrafficMonths6")}
                </SelectItem>
                <SelectItem value="12">
                  {t("admin.postTrafficMonths12")}
                </SelectItem>
                <SelectItem value="all">
                  {t("admin.postTrafficMonthsAll")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ul className="flex flex-col gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="h-4 min-w-0 flex-1" />
                <Skeleton className="h-6 w-[88px] shrink-0" />
                <Skeleton className="h-4 w-12 shrink-0" />
              </li>
            ))}
          </ul>
        ) : error ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t("admin.postTrafficLoadFailed")}
          </p>
        ) : entries.length === 0 ? (
          <div className="relative min-h-32">
            <AdminBlockEmpty className="absolute inset-0" />
            <p className="absolute inset-x-4 bottom-2 text-center text-xs text-muted-foreground">
              {t("admin.postTrafficEmpty")}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            <li className="flex items-center gap-3 border-b px-2 pb-2 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1">{t("admin.posts")}</span>
              <span className="w-[88px] shrink-0 text-center">
                {monthsLabel}
              </span>
              <span className="w-12 shrink-0 text-right">
                {t("admin.postTrafficViews")}
              </span>
            </li>
            {entries.map((entry) => (
              <li
                key={entry.slug}
                className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
              >
                <Link
                  href={`/admin/posts/edit?slug=${encodeURIComponent(entry.slug)}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium transition-colors hover:text-primary"
                >
                  {entry.title}
                </Link>
                <svg
                  viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                  className="h-6 w-[88px] shrink-0 text-primary"
                  role="img"
                  aria-label={`${entry.views} ${t("admin.postTrafficViews")}`}
                >
                  <title>
                    {entry.series
                      .map((p) => `${p.month}: ${p.views}`)
                      .join("\n")}
                  </title>
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={sparklinePoints(
                      entry.series.map((p) => p.views),
                      SPARK_W,
                      SPARK_H
                    )}
                  />
                </svg>
                <span className="w-12 shrink-0 text-right text-sm tabular-nums">
                  {entry.views.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
