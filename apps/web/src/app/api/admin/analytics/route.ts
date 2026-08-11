import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
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
    return NextResponse.json(
      { configured: true, source, error: kind, message },
      { status: 502 }
    )
  }
}
