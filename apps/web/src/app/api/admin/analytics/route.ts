import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import {
  AnalyticsFetchError,
  fetchAnalyticsReport,
  isGaConfigured,
  parseAnalyticsRange,
} from "@/lib/ga-analytics"

/** Admin GA4 traffic report. ?range=today|7d|28d (default 7d). */
export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isGaConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 })
  }

  const range = parseAnalyticsRange(
    new URL(request.url).searchParams.get("range")
  )

  try {
    const report = await fetchAnalyticsReport(range)
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
    console.error("[analytics]", kind, message)
    return NextResponse.json(
      { configured: true, error: kind, message },
      { status: 502 }
    )
  }
}
