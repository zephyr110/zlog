"use client"

import { useMemo, useState } from "react"

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import {
  Card,
  CardAction,
  CardContent,
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { useT } from "@/components/layout/trans"
import { AdminBlockEmpty } from "@/components/admin/admin-block-empty"
import { resolveCategory, getCategoryLabel } from "@/lib/categories"
import { type PostSummary } from "@zlog/database"

/** shadcn chart palette — bars cycle chart-1…chart-5 (token → --color-*). */
const BAR_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

type TimeRange = "7d" | "30d" | "90d" | "all"

interface PostStatsProps {
  posts: PostSummary[]
}

/** Shared chart config for both charts (posts count). */
function buildChartConfig(label: string) {
  return {
    count: {
      label,
      // ChartStyle exposes this as --color-count for series + tooltip.
      color: "var(--chart-2)",
    },
  }
}

const RANGE_DAYS: Record<TimeRange, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
}

// Coarse "now" (refreshed at most once a minute) so the date-window
// cutoff can be computed during render without calling the impure
// Date.now() directly in the component (react-compiler lint) — chart
// windows don't need second-level precision.
let coarseNow: number | null = null
function nowCoarse(): number {
  if (coarseNow === null || Date.now() - coarseNow > 60_000) {
    coarseNow = Date.now()
  }
  return coarseNow
}

/** Short ranges bucket by day; longer ranges by month. */
function bucketKey(date: string, range: TimeRange): string {
  const day = date.slice(0, 10)
  if (range === "7d" || range === "30d") return day
  return day.slice(0, 7) // YYYY-MM
}

/** Axis ticks: keep year on monthly buckets; day buckets show MM-DD. */
function formatTimelineTick(value: string): string {
  if (value.length >= 10) return value.slice(5) // MM-DD
  return value // YYYY-MM
}

export function PostStats({ posts }: PostStatsProps) {
  const { t } = useT()
  // Independent ranges: the timeline and topic filters must not share
  // state — changing one chart's range leaves the other untouched.
  const [timelineRange, setTimelineRange] = useState<TimeRange>("all")
  const [topicRange, setTopicRange] = useState<TimeRange>("all")
  const chartConfig = useMemo(
    () => buildChartConfig(t("admin.posts")),
    [t]
  )

  const publishedPosts = useMemo(() => posts.filter((p) => !p.draft), [posts])

  const timeRangeLabels = useMemo<Record<TimeRange, string>>(
    () => ({
      "7d": t("admin.days7"),
      "30d": t("admin.days30"),
      "90d": t("admin.days90"),
      all: t("admin.allTime"),
    }),
    [t]
  )

  function filterByRange(posts: PostSummary[], range: TimeRange) {
    const days = RANGE_DAYS[range]
    if (days == null) return posts
    // Exact rolling N×24h timestamp window — post.date is a UTC ISO
    // string, so comparing timestamps (not civil-date strings) keeps the
    // boundary correct in every timezone.
    const cutoff = nowCoarse() - days * 86_400_000
    return posts.filter((p) => new Date(p.date).getTime() >= cutoff)
  }

  const timelineFiltered = useMemo(
    () => filterByRange(publishedPosts, timelineRange),
    [publishedPosts, timelineRange]
  )
  const topicFiltered = useMemo(
    () => filterByRange(publishedPosts, topicRange),
    [publishedPosts, topicRange]
  )

  // Posts over time — bucket granularity follows the selected range.
  const timelineData = useMemo(() => {
    const byBucket: Record<string, number> = {}
    for (const p of timelineFiltered) {
      const key = bucketKey(p.date, timelineRange)
      byBucket[key] = (byBucket[key] || 0) + 1
    }
    return Object.entries(byBucket)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }))
  }, [timelineFiltered, timelineRange])

  // Posts by topic — tags roll up to their category prefix (e.g.
  // "frontend-react" → "frontend"); a post counts once per topic even if
  // several of its tags resolve to the same one.
  const topicData = useMemo(() => {
    const byTopic: Record<string, number> = {}
    for (const p of topicFiltered) {
      const topics = new Set(p.tags.map(resolveCategory))
      for (const topic of topics) {
        byTopic[topic] = (byTopic[topic] || 0) + 1
      }
    }
    return Object.entries(byTopic)
      .map(([topic, count]) => ({
        topic,
        label: getCategoryLabel(topic, t),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((row, index) => ({
        ...row,
        // Payload fill so ChartTooltipContent indicator matches the bar.
        fill: BAR_COLORS[index % BAR_COLORS.length],
      }))
  }, [topicFiltered, t])

  const renderTimeRangeSelect = (
    range: TimeRange,
    onRangeChange: (r: TimeRange) => void
  ) => (
    <Select
      value={range}
      onValueChange={(v) => onRangeChange(v as TimeRange)}
    >
      <SelectTrigger size="sm" className="w-28">
        <SelectValue>{timeRangeLabels[range]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="7d">{t("admin.days7")}</SelectItem>
        <SelectItem value="30d">{t("admin.days30")}</SelectItem>
        <SelectItem value="90d">{t("admin.days90")}</SelectItem>
        <SelectItem value="all">{t("admin.allTime")}</SelectItem>
      </SelectContent>
    </Select>
  )

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
      {/* Timeline Chart — tighter card chrome: less gap between the
          title row and the plot area than the default 16px spacing. */}
      <Card className="gap-2 [--card-spacing:--spacing(4)]">
        <CardHeader className="pb-0">
          <CardTitle className="text-base">{t("admin.postsOverTime")}</CardTitle>
          <CardAction>
            {renderTimeRangeSelect(timelineRange, setTimelineRange)}
          </CardAction>
        </CardHeader>
        <CardContent className="pt-0">
          {timelineData.length === 0 ? (
            <AdminBlockEmpty className="h-[240px] py-0" />
          ) : (
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[240px] w-full"
            >
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-count)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-count)"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={formatTimelineTick}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={32}
                />
                <ChartTooltip
                  cursor={{ stroke: "var(--border)" }}
                  content={<ChartTooltipContent indicator="line" />}
                />
                {/* isAnimationActive=false on all admin charts: full-page
                    screenshot tools resize the viewport mid-capture, which
                    replays enter animations and catches an empty frame. */}
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-count)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCount)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Topics Chart — same tightened chrome as the timeline card. */}
      <Card className="gap-2 [--card-spacing:--spacing(4)]">
        <CardHeader className="pb-0">
          <CardTitle className="text-base">{t("admin.postsByTopic")}</CardTitle>
          <CardAction>
            {renderTimeRangeSelect(topicRange, setTopicRange)}
          </CardAction>
        </CardHeader>
        <CardContent className="pt-0">
          {topicData.length === 0 ? (
            <AdminBlockEmpty className="h-[240px] py-0" />
          ) : (
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[240px] w-full"
            >
              <BarChart data={topicData} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="var(--border)"
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  width={110}
                  tickMargin={8}
                  tickFormatter={(value: string) =>
                    value.length > 14 ? `${value.slice(0, 13)}…` : value
                  }
                  interval={0}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  content={<ChartTooltipContent indicator="dot" />}
                />
                {/* Per-row `fill` on topicData drives both the bar and the
                    tooltip indicator (shadcn chart-data fill pattern). */}
                <Bar
                  dataKey="count"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={20}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
