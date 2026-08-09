import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import {
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
    console.error("[analytics]", err instanceof Error ? err.message : err)
    return NextResponse.json(
      { configured: true, error: "Analytics unavailable" },
      { status: 502 }
    )
  }
}
