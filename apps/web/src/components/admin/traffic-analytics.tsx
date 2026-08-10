"use client"

import { useEffect, useState } from "react"
import { Users, Eye } from "lucide-react"
import { Label, Pie, PieChart } from "recharts"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { TruncateTooltip } from "@/components/ui/truncate-tooltip"
import { AdminBlockEmpty } from "@/components/admin/admin-block-empty"
import { CountryDotMap } from "@/components/admin/country-dot-map"
import {
  CHART_COLORS,
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
      {/* min-h only from md — on phones a forced 160px floor leaves empty
          gutters under short Devices/Sources content. */}
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 md:min-h-40">
        {children}
      </div>
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
    <ul className="flex flex-col gap-1">
      {rows.map((row, i) => (
        <li
          key={`${row.label}-${i}`}
          className="relative overflow-hidden rounded-md transition-colors hover:bg-muted/50"
        >
          {/* Background data-bar (Plausible/GA style): magnitude reads from
              the wash, so each row stays a single compact line. */}
          <div
            className="absolute inset-y-0 left-0 rounded-md bg-chart-2/15"
            style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }}
            aria-hidden="true"
          />
          <div className="relative flex items-baseline justify-between gap-3 px-2 py-1.5 text-sm">
            {/* Paths clip on the left ("…/my-slug") — the tail carries the
                identity when several rows share a /posts/ prefix. Full path
                stays available via TruncateTooltip when overflowed.
                direction:rtl puts the ellipsis at the left edge; do NOT add
                unicode-bidi:plaintext here — it resolves Latin paths back
                to LTR and the ellipsis ends up clipping the tail instead. */}
            <TruncateTooltip className="font-medium [direction:rtl] [text-align:left]">
              {row.label}
            </TruncateTooltip>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {row.value.toLocaleString()}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Sources donut row — stacked by default; side-by-side only when the
 * card container is wide enough (@container), so a half-width panel at
 * ~1024px viewport doesn’t pin the ring to the left with a void on the right.
 */
const DONUT_ROW_CLASS = cn(
  "mx-auto flex w-full flex-col items-center gap-5",
  "@[24rem]:flex-row @[24rem]:justify-center @[24rem]:gap-8 @[24rem]:px-2",
  "@[32rem]:gap-12"
)

const DONUT_RING_CLASS = cn(
  "aspect-square h-auto w-[min(100%,11.25rem)] shrink-0",
  "@[24rem]:w-[min(42%,13.75rem)]"
)

const DONUT_LEGEND_CLASS = cn(
  "flex w-full max-w-[15rem] min-w-0 flex-col justify-center gap-1.5",
  "@[24rem]:w-44 @[24rem]:max-w-none @[24rem]:flex-none",
  "@[36rem]:w-56"
)

/** Horizontal donut (ring + centered total + side legend) for the Sources
 *  panel — channels are a closed taxonomy, so the full-composition story
 *  is real. (Devices deliberately uses a stacked bar for form variety.) */
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
    <div className="@container flex flex-1 flex-col justify-center">
      <div className={DONUT_ROW_CLASS}>
        <ChartContainer config={config} className={DONUT_RING_CLASS}>
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={data}
              dataKey="users"
              nameKey="label"
              innerRadius="59%"
              outerRadius="85%"
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

        <ul className={DONUT_LEGEND_CLASS}>
          {data.map((d) => (
            <li key={d.key} className="flex items-center gap-2 text-xs">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <TruncateTooltip className="font-medium">{d.label}</TruncateTooltip>
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

function DevicesStackedBar({
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
    desktop: CHART_COLORS[0],
    mobile: CHART_COLORS[1],
    tablet: CHART_COLORS[2],
    other: CHART_COLORS[3],
  }
  // Aggregate by normalized key first — GA can return several categories
  // that all fold into "other" (e.g. "(not set)", "tv"), which would
  // otherwise produce duplicate segments and duplicate React keys.
  const byKey = new Map<DeviceKey, { key: DeviceKey; label: string; users: number }>()
  for (const d of devices) {
    const key = deviceKey(d.device)
    const entry = byKey.get(key)
    if (entry) entry.users += d.users
    else byKey.set(key, { key, label: labels[key], users: d.users })
  }
  const total = [...byKey.values()].reduce((sum, d) => sum + d.users, 0) || 1
  const data = [...byKey.values()].map((d) => ({
    ...d,
    color: colors[d.key],
    pct: (d.users / total) * 100,
  }))

  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      {/* 100%-stacked bar; a segment shows its inline % only when wide
          enough, narrow ones stay readable via the detail rows below. */}
      <div className="flex h-9 w-full gap-[3px]" aria-hidden="true">
        {data.map((d) => (
          <div
            key={d.key}
            className="flex items-center justify-center rounded-sm transition-[width]"
            style={{ width: `${d.pct}%`, backgroundColor: d.color }}
          >
            {d.pct >= 12 && (
              <span className="text-[11px] font-semibold text-white [text-shadow:0_0_3px_rgba(0,0,0,0.4)]">
                {d.pct.toFixed(0)}%
              </span>
            )}
          </div>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2 text-sm">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            <TruncateTooltip className="font-medium">{d.label}</TruncateTooltip>
            <span className="ml-auto shrink-0 tabular-nums">
              {d.users.toLocaleString()}
            </span>
            <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">
              {d.pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Channel colors rotate through the five chart tokens; with ≤5 active
 *  channels (the common case) every slice gets a distinct color. */
const CHANNEL_COLORS = CHART_COLORS

/** GA4 sessionDefaultChannelGroup → admin i18n key. Unknown channels
 *  fall through to the raw GA string. */
const CHANNEL_I18N_KEYS = {
  Direct: "admin.channelDirect",
  "Organic Search": "admin.channelOrganicSearch",
  "Paid Search": "admin.channelPaidSearch",
  "Organic Social": "admin.channelOrganicSocial",
  "Paid Social": "admin.channelPaidSocial",
  "Organic Shopping": "admin.channelOrganicShopping",
  "Paid Shopping": "admin.channelPaidShopping",
  "Organic Video": "admin.channelOrganicVideo",
  "Paid Video": "admin.channelPaidVideo",
  Display: "admin.channelDisplay",
  "Paid Other": "admin.channelPaidOther",
  Referral: "admin.channelReferral",
  Email: "admin.channelEmail",
  Affiliates: "admin.channelAffiliates",
  Audio: "admin.channelAudio",
  SMS: "admin.channelSms",
  "Mobile Push Notifications": "admin.channelMobilePush",
  "Cross-network": "admin.channelCrossNetwork",
  Unassigned: "admin.channelUnassigned",
} as const satisfies Record<string, `admin.channel${string}`>

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
    const i18nKey =
      CHANNEL_I18N_KEYS[s.source as keyof typeof CHANNEL_I18N_KEYS]
    const label = i18nKey ? (t(i18nKey) as string) : s.source
    const entry = byKey.get(key)
    if (entry) entry.users += s.users
    else byKey.set(key, { key, label, users: s.users })
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
        // The server-side GA chain (OAuth + batch, with direct→proxy
        // failover) can legitimately take 15-40s — far beyond the default
        // 15s apiFetch timeout, which would abort slow-but-successful
        // reports and misreport them as a network timeout.
        const res = await apiFetch(`/api/admin/analytics?range=${range}`, {
          timeout: 60_000,
        })
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
      } catch (err) {
        // Only genuine aborts are a timeout; a thrown parse/network error
        // is a server or transport failure, not a timeout.
        const name = err instanceof Error ? err.name : ""
        const kind =
          name === "TimeoutError" || name === "AbortError" ? "timeout" : "unavailable"
        if (!cancelled) setState({ status: "error", kind })
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
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
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
                <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
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
                <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                  {state.data.totals.screenPageViews.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
            {/* Two columns only from xl — below that, full-width cards so
                Sources’ donut+legend can breathe (half-width ~1024px was
                pinning the ring left with empty space on the right). */}
            <PanelCard title={t("admin.analyticsDevices")}>
              <DevicesStackedBar devices={state.data.devices} />
            </PanelCard>
            <PanelCard title={t("admin.analyticsSources")}>
              <SourcesDonut sources={state.data.sources} />
            </PanelCard>
            <PanelCard title={t("admin.analyticsTopPages")}>
              <RankList
                rows={state.data.topPages.map((p) => ({
                  label: p.path,
                  value: p.views,
                }))}
              />
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
  // Mirrors PanelCard chrome: Card's 16px --card-spacing gap/padding and the
  // content column (min-h only from md, matching PanelCard).
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card py-4 ring-1 ring-foreground/10">
      <div className="px-4">
        <Skeleton className={cn("h-4", titleWidth)} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 md:min-h-40">
        {children}
      </div>
    </div>
  )
}

/** Chunky stacked bar + detail rows; mirrors DevicesStackedBar. */
function StackedBarSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <Skeleton className="h-9 w-full rounded-sm" />
      <ul className="flex flex-col gap-2">
        {[0, 1, 2].map((j) => (
          <li key={j} className="flex items-center gap-2">
            <Skeleton className="size-2 shrink-0 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-8 shrink-0" />
            <Skeleton className="h-4 w-10 shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Donut ring + legend — mirrors CompositionDonut breakpoints (@container). */
function DonutSkeleton() {
  return (
    <div className="@container flex flex-1 flex-col justify-center">
      <div className={DONUT_ROW_CLASS}>
        <div className={cn(DONUT_RING_CLASS, "relative")}>
          {/* Hollow ring ≈ pie inner/outer radii; center mirrors total + label. */}
          <div
            aria-hidden
            className="absolute inset-0 animate-pulse rounded-full border-[1.35rem] border-muted"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-3 w-8" />
          </div>
        </div>
        <ul className={DONUT_LEGEND_CLASS}>
          {[0, 1, 2, 3].map((j) => (
            <li key={j} className="flex items-center gap-2">
              <Skeleton className="size-2 shrink-0 rounded-full" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-5 shrink-0" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Totals + 4-panel placeholder. Exported so the dashboard page-level
 *  loading state mirrors the same shapes (header is rendered there).
 *  Panel order mirrors the real grid: devices, sources, pages, countries. */
export function TrafficSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
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
              <Skeleton className="h-8 w-16 sm:h-9" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
        {/* Devices — stacked bar */}
        <PanelChrome titleWidth="w-20">
          <StackedBarSkeleton />
        </PanelChrome>
        {/* Sources — donut */}
        <PanelChrome titleWidth="w-20">
          <DonutSkeleton />
        </PanelChrome>
        {/* Top pages — single-line data-bar rows (RankList) */}
        <PanelChrome titleWidth="w-28">
          <ul className="flex flex-col gap-1">
            {Array.from({ length: 6 }).map((_, j) => (
              <li
                key={j}
                className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5"
              >
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-8 shrink-0" />
              </li>
            ))}
          </ul>
        </PanelChrome>
        {/* Countries — dotted map (95:48 viewBox) + chip row */}
        <PanelChrome titleWidth="w-24">
          <div className="flex flex-col gap-3">
            <Skeleton className="aspect-[95/48] w-full rounded-md" />
            <ul className="flex flex-wrap gap-1.5">
              {["w-20", "w-24", "w-16", "w-28", "w-14", "w-32"].map((w, j) => (
                <li key={j}>
                  <Skeleton className={cn("h-6 rounded-full", w)} />
                </li>
              ))}
            </ul>
          </div>
        </PanelChrome>
      </div>
    </>
  )
}
