"use client"

import { useEffect, useState } from "react"
import { Users, Eye } from "lucide-react"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { useT } from "@/components/layout/trans"
import { apiFetch } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import type { AnalyticsRange, AnalyticsReport } from "@/lib/ga-analytics"

const RANGES: AnalyticsRange[] = ["today", "7d", "28d"]

type FetchState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "error" }
  | { status: "ok"; data: AnalyticsReport }

function RankList({
  rows,
}: {
  rows: { label: string; value: number }[]
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">—</p>
    )
  }
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="flex flex-col gap-2.5 px-4 pb-4">
      {rows.map((row) => (
        <li key={row.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium" title={row.label}>
              {row.label}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {row.value.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function TrafficAnalytics() {
  const { t } = useT()
  const [range, setRange] = useState<AnalyticsRange>("7d")
  const [state, setState] = useState<FetchState>({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    setState({ status: "loading" })

    async function load() {
      try {
        const res = await apiFetch(`/api/admin/analytics?range=${range}`)
        if (cancelled) return
        if (res.status === 503) {
          setState({ status: "unconfigured" })
          return
        }
        if (!res.ok) {
          setState({ status: "error" })
          return
        }
        const data = (await res.json()) as AnalyticsReport
        setState({ status: "ok", data })
      } catch {
        if (!cancelled) setState({ status: "error" })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [range])

  const rangeLabel = (r: AnalyticsRange) => {
    if (r === "today") return t("admin.analyticsRangeToday")
    if (r === "7d") return t("admin.analyticsRange7d")
    return t("admin.analyticsRange28d")
  }

  return (
    <section className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">
          {t("admin.traffic")}
        </h2>
        <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                range === r
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {rangeLabel(r)}
            </button>
          ))}
        </div>
      </div>

      {state.status === "loading" ? (
        <TrafficSkeleton />
      ) : state.status === "unconfigured" ? (
        <EmptyState
          className="rounded-xl bg-card py-12 ring-1 ring-foreground/10"
          title={t("admin.analyticsNotConfigured")}
          description={t("admin.analyticsNotConfiguredDesc")}
        />
      ) : state.status === "error" ? (
        <EmptyState
          className="rounded-xl bg-card py-12 ring-1 ring-foreground/10"
          title={t("admin.analyticsLoadFailed")}
          description={t("admin.analyticsLoadFailedDesc")}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("admin.analyticsUsers")}
                </CardTitle>
                <CardAction>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Users size={16} />
                  </span>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {state.data.totals.activeUsers.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("admin.analyticsPageViews")}
                </CardTitle>
                <CardAction>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Eye size={16} />
                  </span>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {state.data.totals.screenPageViews.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
            <Card className="py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm font-medium">
                  {t("admin.analyticsTopPages")}
                </CardTitle>
              </CardHeader>
              <RankList
                rows={state.data.topPages.map((p) => ({
                  label: p.path,
                  value: p.views,
                }))}
              />
            </Card>
            <Card className="py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm font-medium">
                  {t("admin.analyticsSources")}
                </CardTitle>
              </CardHeader>
              <RankList
                rows={state.data.sources.map((s) => ({
                  label: s.source,
                  value: s.users,
                }))}
              />
            </Card>
            <Card className="py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm font-medium">
                  {t("admin.analyticsDevices")}
                </CardTitle>
              </CardHeader>
              <RankList
                rows={state.data.devices.map((d) => ({
                  label: d.device,
                  value: d.users,
                }))}
              />
            </Card>
            <Card className="py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm font-medium">
                  {t("admin.analyticsCountries")}
                </CardTitle>
              </CardHeader>
              <RankList
                rows={state.data.countries.map((c) => ({
                  label: c.country,
                  value: c.users,
                }))}
              />
            </Card>
          </div>
        </>
      )}
    </section>
  )
}

function TrafficSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-4 rounded-xl bg-card py-4 ring-1 ring-foreground/10"
          >
            <div className="flex items-start justify-between px-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
            <div className="px-4">
              <Skeleton className="h-9 w-16" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl bg-card py-4 ring-1 ring-foreground/10"
          >
            <div className="px-4">
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="flex flex-col gap-3 px-4 pb-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-6 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
