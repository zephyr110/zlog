import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-auth"
import { isDemoMode } from "@/lib/demo-mode"
import { mockPostTrafficReport } from "@/lib/demo-analytics"
import {
  addMonths,
  currentMonthKey,
  monthsBetween,
  parseAnalyticsSource,
} from "@/lib/analytics-shared"
import { isGaConfigured } from "@/lib/ga-analytics"
import { isVercelAnalyticsConfigured } from "@/lib/vercel-analytics"
import { buildPostTraffic } from "@/lib/post-traffic"
import {
  earliestArchivedMonth,
  listPostTitles,
  monthlyDimensionRows,
} from "@zlog/database"

/** 归因窗口：近 6 / 12 个完整自然月，或全部归档月（默认 6）。 */
function parseMonthsWindow(raw: string | null): 6 | 12 | "all" {
  if (raw === "12") return 12
  if (raw === "all") return "all"
  return 6
}

/** Content-level attribution: per-post monthly view trends built from the
 *  traffic archive (analytics_monthly, dimension='pages'), joined to the
 *  blog's posts by slug.
 *
 *  ?source=ga|vercel (default vercel) &months=6|12|all (default 6) */
export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const source = parseAnalyticsSource(url.searchParams.get("source"))
  const span = parseMonthsWindow(url.searchParams.get("months"))

  // 演示环境：与真实报告同形状的 mock（访客也能看到完整面板）。
  if (isDemoMode()) {
    return NextResponse.json(mockPostTrafficReport(source, span), {
      headers: { "Cache-Control": "private, max-age=60" },
    })
  }

  const configured =
    source === "vercel" ? isVercelAnalyticsConfigured() : isGaConfigured()
  if (!configured) {
    return NextResponse.json(
      { configured: false, source },
      { status: 503 }
    )
  }

  // 归档只覆盖完整自然月（当月走实时面板，不在这里）。
  const toMonth = addMonths(currentMonthKey(), -1)
  const earliest = await earliestArchivedMonth(source)
  const headers = { "Cache-Control": "private, max-age=60" }
  if (!earliest || earliest > toMonth) {
    return NextResponse.json(
      { configured: true, source, months: [], posts: [] },
      { headers }
    )
  }

  const candidate = span === "all" ? earliest : addMonths(toMonth, -(span - 1))
  const fromMonth = candidate < earliest ? earliest : candidate
  const months = monthsBetween(fromMonth, toMonth)
  const rows = await monthlyDimensionRows(source, "pages", fromMonth, toMonth)
  // 标题映射含草稿：被归档过的文章即使已转草稿，趋势仍应显示。
  const posts = await listPostTitles()

  return NextResponse.json(
    {
      configured: true,
      source,
      months,
      posts: buildPostTraffic(rows, posts, months),
    },
    { headers }
  )
}
