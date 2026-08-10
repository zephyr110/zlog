"use client"

import { useEffect, useState } from "react"
import { Users, Eye } from "lucide-react"
import { Label, Pie, PieChart } from "recharts"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { AdminBlockEmpty } from "@/components/admin/admin-block-empty"
import { CountryDotMap } from "@/components/admin/country-dot-map"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useT } from "@/components/layout/trans"
import { apiFetch } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import type { AnalyticsRange, AnalyticsReport } from "@/lib/ga-analytics"

const RANGES: AnalyticsRange[] = ["today", "7d", "28d"]

type ErrorKind = "timeout" | "permission" | "unavailable"

type FetchState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "error"; kind: ErrorKind }
  | { status: "ok"; data: AnalyticsReport }

function parseErrorKind(raw: unknown): ErrorKind {
  if (raw === "timeout" || raw === "permission" || raw === "unavailable") {
    return raw
  }
  return "unavailable"
}

/** Shared chrome for the four breakdown panels (title + content column). */
function PanelCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className="flex flex-col py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <div className="flex min-h-40 flex-1 flex-col px-4 pb-4">{children}</div>
    </Card>
  )
}

function RankList({
  rows,
}: {
  rows: { label: string; value: number }[]
}) {
  if (rows.length === 0) {
    return <AdminBlockEmpty className="min-h-0 flex-1" />
  }
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row, i) => (
        <li key={`${row.label}-${i}`} className="flex flex-col gap-1">
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

/** Horizontal donut (ring + centered total + side legend) shared by the
 *  closed-taxonomy panels — devices and traffic sources both tell a
 *  full-composition story. */
function CompositionDonut({
  data,
  config,
}: {
  // `fill` resolves only inside the ChartContainer scope (ChartStyle injects
  // --color-{key} there); `color` is the global chart token for the legend,
  // which renders outside that scope.
  data: { key: string; label: string; users: number; fill: string; color: string }[]
  config: ChartConfig
}) {
  const { t } = useT()
  const total = data.reduce((sum, d) => sum + d.users, 0)

  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <ChartContainer
          config={config}
          className="aspect-square h-[150px] shrink-0"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={data}
              dataKey="users"
              nameKey="label"
              innerRadius={44}
              outerRadius={64}
              stroke="var(--color-card)"
              strokeWidth={4}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-xl font-semibold tabular-nums"
                        >
                          {total.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 18}
                          className="fill-muted-foreground text-xs"
                        >
                          {t("admin.analyticsUsers")}
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>

        <ul className="flex w-full min-w-0 flex-1 flex-col justify-center gap-1.5">
          {data.map((d) => (
            <li key={d.key} className="flex items-center gap-2 text-xs">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="min-w-0 truncate font-medium" title={d.label}>
                {d.label}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {d.users.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** GA deviceCategory values outside the big three fold into "other". */
type DeviceKey = "desktop" | "mobile" | "tablet" | "other"

function deviceKey(raw: string): DeviceKey {
  const k = raw.toLowerCase()
  if (k === "desktop" || k === "mobile" || k === "tablet") return k
  return "other"
}

function DevicesDonut({
  devices,
}: {
  devices: { device: string; users: number }[]
}) {
  const { t } = useT()

  if (devices.length === 0) {
    return <AdminBlockEmpty className="min-h-0 flex-1" />
  }

  const labels: Record<DeviceKey, string> = {
    desktop: t("admin.deviceDesktop"),
    mobile: t("admin.deviceMobile"),
    tablet: t("admin.deviceTablet"),
    other: t("admin.deviceOther"),
  }
  const colors: Record<DeviceKey, string> = {
    desktop: "var(--color-chart-1)",
    mobile: "var(--color-chart-2)",
    tablet: "var(--color-chart-3)",
    other: "var(--color-chart-4)",
  }
  const chartConfig: ChartConfig = {
    users: { label: t("admin.analyticsUsers") },
    ...Object.fromEntries(
      (Object.keys(labels) as DeviceKey[]).map((key) => [
        key,
        { label: labels[key], color: colors[key] },
      ])
    ),
  }
  // Aggregate by normalized key first — GA can return several categories
  // that all fold into "other" (e.g. "(not set)", "tv"), which would
  // otherwise produce duplicate slices and duplicate React keys.
  const byKey = new Map<DeviceKey, { key: DeviceKey; label: string; users: number }>()
  for (const d of devices) {
    const key = deviceKey(d.device)
    const entry = byKey.get(key)
    if (entry) entry.users += d.users
    else byKey.set(key, { key, label: labels[key], users: d.users })
  }
  const data = [...byKey.values()].map((d) => ({
    ...d,
    fill: `var(--color-${d.key})`,
    color: colors[d.key],
  }))

  return <CompositionDonut data={data} config={chartConfig} />
}

/** Channel colors rotate through the five chart tokens; with ≤5 active
 *  channels (the common case) every slice gets a distinct color. */
const CHANNEL_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
] as const

function SourcesDonut({
  sources,
}: {
  sources: { source: string; users: number }[]
}) {
  const { t } = useT()

  if (sources.length === 0) {
    return <AdminBlockEmpty className="min-h-0 flex-1" />
  }

  // CSS-var keys need sanitized identifiers ("Organic Search" →
  // "organic-search"); aggregate defensively in case two channel names
  // sanitize to the same key.
  const byKey = new Map<string, { key: string; label: string; users: number }>()
  for (const s of sources) {
    const key =
      s.source
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "unknown"
    const entry = byKey.get(key)
    if (entry) entry.users += s.users
    else byKey.set(key, { key, label: s.source, users: s.users })
  }
  const data = [...byKey.values()].map((d, i) => ({
    ...d,
    fill: `var(--color-${d.key})`,
    color: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
  }))
  const chartConfig: ChartConfig = {
    users: { label: t("admin.analyticsUsers") },
    ...Object.fromEntries(data.map((d) => [d.key, { label: d.label, color: d.color }])),
  }

  return <CompositionDonut data={data} config={chartConfig} />
}

export function TrafficAnalytics() {
  const { t } = useT()
  const [range, setRange] = useState<AnalyticsRange>("7d")
  const [state, setState] = useState<FetchState>({ status: "loading" })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await apiFetch(`/api/admin/analytics?range=${range}`)
        if (cancelled) return
        if (res.status === 503) {
          setState({ status: "unconfigured" })
          return
        }
        if (!res.ok) {
          let kind: ErrorKind = "unavailable"
          try {
            const body = (await res.json()) as { error?: unknown }
            kind = parseErrorKind(body.error)
          } catch {
            /* ignore */
          }
          if (!cancelled) setState({ status: "error", kind })
          return
        }
        const data = (await res.json()) as AnalyticsReport
        if (!cancelled) setState({ status: "ok", data })
      } catch {
        if (!cancelled) setState({ status: "error", kind: "timeout" })
      }
    }

    void load()
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
              onClick={() => {
                if (r === range) return
                setRange(r)
                setState({ status: "loading" })
              }}
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
          title={
            state.kind === "timeout"
              ? t("admin.analyticsTimeout")
              : state.kind === "permission"
                ? t("admin.analyticsPermission")
                : t("admin.analyticsLoadFailed")
          }
          description={
            state.kind === "timeout"
              ? t("admin.analyticsTimeoutDesc")
              : state.kind === "permission"
                ? t("admin.analyticsPermissionDesc")
                : t("admin.analyticsLoadFailedDesc")
          }
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
            {/* Order alternates composition (donuts) with distribution
                (list/map) so the two donuts never sit side by side. */}
            <PanelCard title={t("admin.analyticsTopPages")}>
              <RankList
                rows={state.data.topPages.map((p) => ({
                  label: p.path,
                  value: p.views,
                }))}
              />
            </PanelCard>
            <PanelCard title={t("admin.analyticsDevices")}>
              <DevicesDonut devices={state.data.devices} />
            </PanelCard>
            <PanelCard title={t("admin.analyticsCountries")}>
              {state.data.countries.length === 0 ? (
                <AdminBlockEmpty className="min-h-0 flex-1" />
              ) : (
                <CountryDotMap
                  countries={state.data.countries.map((c) => ({
                    code: c.countryId,
                    name: c.country,
                    users: c.users,
                  }))}
                  usersLabel={t("admin.analyticsUsers")}
                />
              )}
            </PanelCard>
            <PanelCard title={t("admin.analyticsSources")}>
              <SourcesDonut sources={state.data.sources} />
            </PanelCard>
          </div>
        </>
      )}
    </section>
  )
}

function PanelChrome({
  titleWidth,
  children,
}: {
  titleWidth: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card py-4 ring-1 ring-foreground/10">
      <div className="px-4">
        <Skeleton className={cn("h-4", titleWidth)} />
      </div>
      <div className="flex flex-col gap-3 px-4 pb-2">{children}</div>
    </div>
  )
}

/** Donut ring + legend rows. The border trick draws a hollow ring,
 *  matching the real 64/44 radii → 20px stroke. */
function DonutSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="size-[150px] shrink-0 animate-pulse rounded-full border-[20px] border-muted" />
      <div className="flex w-full min-w-0 flex-1 flex-col gap-2.5">
        {[0, 1, 2].map((j) => (
          <Skeleton key={j} className="h-4 w-full" />
        ))}
      </div>
    </div>
  )
}

/** Totals + 4-panel placeholder. Exported so the dashboard page-level
 *  loading state mirrors the same shapes (header is rendered there).
 *  Panel order mirrors the real grid: pages list, devices donut,
 *  countries map, sources donut. */
export function TrafficSkeleton() {
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
        {/* Top pages — ranked list */}
        <PanelChrome titleWidth="w-28">
          {Array.from({ length: 4 }).map((_, j) => (
            <Skeleton key={j} className="h-6 w-full" />
          ))}
        </PanelChrome>
        {/* Devices — donut */}
        <PanelChrome titleWidth="w-20">
          <DonutSkeleton />
        </PanelChrome>
        {/* Countries — dotted map (95:48 viewBox) + 2-col legend */}
        <PanelChrome titleWidth="w-24">
          <Skeleton className="aspect-[95/48] w-full rounded-md" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-full" />
            ))}
          </div>
        </PanelChrome>
        {/* Sources — donut */}
        <PanelChrome titleWidth="w-20">
          <DonutSkeleton />
        </PanelChrome>
      </div>
    </>
  )
}
