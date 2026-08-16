import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import { mockAnalyticsReport } from "@/lib/demo-analytics"
import { isDemoMode } from "@/lib/demo-mode"
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

/** Admin traffic report.
 *  ?source=ga|vercel (default vercel) &range=today|7d|30d (default 7d). */
export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const source = parseAnalyticsSource(url.searchParams.get("source"))
  const range = parseAnalyticsRange(url.searchParams.get("range"))

  // 演示环境：两个来源都返回 mock 数据（访客体验完整 Traffic 面板）
  if (isDemoMode()) {
    return NextResponse.json(mockAnalyticsReport(source, range), {
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
        ? await fetchVercelAnalyticsReport(range)
        : await fetchAnalyticsReport(range)
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
