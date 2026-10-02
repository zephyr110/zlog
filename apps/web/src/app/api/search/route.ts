import { NextRequest, NextResponse } from "next/server"
import { searchPublishedPosts } from "@zlog/database"
import { rankSearchResults, tokenizeQuery } from "@/lib/search"

const MAX_QUERY_LENGTH = 100
const MAX_RESULTS = 30

/** GET /api/search?q=… — public full-text search over published posts.
 *  Drafts are excluded at the SQL layer (searchPublishedPosts). */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("q") ?? ""
  const query = raw.slice(0, MAX_QUERY_LENGTH).trim()
  const terms = tokenizeQuery(query)

  if (terms.length === 0) {
    return NextResponse.json({ results: [] })
  }

  try {
    const posts = await searchPublishedPosts(terms)
    const results = rankSearchResults(posts, terms).slice(0, MAX_RESULTS)
    return NextResponse.json(
      { results },
      // Content changes are rare and the response is public — a short CDN
      // cache absorbs repeat queries without staling new posts for long.
      { headers: { "Cache-Control": "public, max-age=60" } }
    )
  } catch (error) {
    console.error("Search error:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
