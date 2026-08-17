import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import { mockAnalyticsReport } from "@/lib/demo-analytics"
import { isDemoMode } from "@/lib/demo-mode"
import { todayKey, type AnalyticsCustomRange } from "@/lib/analytics-shared"
import {
  AnalyticsFetchError,
  fetchAnalyticsReport,
  isGaConfigured,
  parseAnalyticsRange,
  parseAnalyticsSource,
} from "@/lib/ga-analytics"
import {
  fetchVercelAnalyticsReport,
  isVercelAnalyticsConfigured,
} from "@/lib/vercel-analytics"

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** ?from&to 为 'YYYY-MM-DD' 的合法区间：from ≤ to、不超今天。
 *  防御性钳制（picker 已禁用越界日期，API 不再报 400）。 */
function parseCustomRange(
  from: string | null,
  to: string | null
): AnalyticsCustomRange | null {
  if (!from || !to || !DAY_RE.test(from) || !DAY_RE.test(to)) return null
  const today = todayKey()
  const start = from <= to ? from : to
  const end = to < today ? to : today
  return { start, end }
}

/** Admin traffic report.
 *  ?source=ga|vercel (default vercel) &range=today|7d|30d|all|custom
 *  (default 7d) &from&to (custom 专用，'YYYY-MM-DD')。 */
export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const source = parseAnalyticsSource(url.searchParams.get("source"))
  const range = parseAnalyticsRange(url.searchParams.get("range"))
  const custom =
    range === "custom"
      ? parseCustomRange(
          url.searchParams.get("from"),
          url.searchParams.get("to")
        )
      : null

  // 演示环境：两个来源都返回 mock 数据（访客体验完整 Traffic 面板）
  if (isDemoMode()) {
    return NextResponse.json(mockAnalyticsReport(source, range, custom), {
      headers: { "Cache-Control": "private, max-age=60" },
    })
  }

  const available = {
    ga: isGaConfigured(),
    vercel: isVercelAnalyticsConfigured(),
  }

  const configured = source === "vercel" ? available.vercel : available.ga
  if (!configured) {
    return NextResponse.json(
      { configured: false, source, available },
      { status: 503 }
    )
  }

  try {
    const report =
      source === "vercel"
        ? await fetchVercelAnalyticsReport(range, custom)
        : await fetchAnalyticsReport(range, custom)
    return NextResponse.json(report, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    })
  } catch (err) {
    const kind =
      err instanceof AnalyticsFetchError ? err.kind : "unavailable"
    const message =
      err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)
    console.error("[analytics]", source, kind, message)
    const timeoutHint =
      kind === "timeout" && err instanceof AnalyticsFetchError
        ? err.timeoutHint
        : undefined
    return NextResponse.json(
      {
        configured: true,
        source,
        error: kind,
        message,
        ...(timeoutHint ? { timeoutHint } : {}),
      },
      { status: 502 }
    )
  }
}
