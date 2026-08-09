# GA4 tracking + admin analytics — design

Integrate Google Analytics 4 for site traffic collection, and surface core reports on the admin dashboard via the GA4 Data API. Keep Vercel Analytics as a complementary deploy-side signal.

## Goals

- Load GA4 gtag on the public site when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set (current value for this project: `G-B9V6P6CEKB`).
- Authenticated admin dashboard shows traffic for **today / last 7 days / last 28 days**:
  - Totals: active users, page views
  - Breakdowns: top pages, traffic sources, devices, countries/regions
- Secrets stay server-only; missing config shows a calm empty state (no crash).
- Works on Vercel / local `pnpm dev` for the Data API path. Static GitHub Pages export can still emit the client tag; admin reports require API routes (Vercel only).

## Non-goals (v1)

- Realtime GA stream
- Editing measurement ID / credentials in site-settings UI
- Removing Vercel Analytics
- Separate GA properties per host (Vercel vs `github.io`) — single measurement ID is fine for v1
- Custom event builder or ecommerce

## Approach

**A — Client gtag + authenticated Data API proxy** (chosen).

Looker Studio embeds or “open GA console” links alone do not meet the in-admin requirement. Vercel Analytics has no practical hobby-tier API for a custom dashboard.

## Environment variables

| Variable | Side | Purpose |
|----------|------|---------|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Public | e.g. `G-B9V6P6CEKB` — enables client tag |
| `GA_PROPERTY_ID` | Server | Numeric GA4 **property** ID (not Measurement ID, not data-stream ID) |
| `GA_CLIENT_EMAIL` | Server | Service account email |
| `GA_PRIVATE_KEY` | Server | Service account `private_key` (PEM; `\n` escaped in env) |

Document all four in `apps/web/.env.local.example` with comments. Never commit real keys.

Service account must be added to the GA4 property as **Viewer**. Enable **Google Analytics Data API** on the GCP project that owns the key.

## Client tracking

- File: `apps/web/src/app/layout.tsx` (root layout, alongside existing `<Analytics />`).
- Prefer `@next/third-parties/google` `GoogleAnalytics` when the public env is non-empty; otherwise render nothing.
- No admin-path exclusion in v1 (admin traffic is negligible / acceptable).

## Server API

- Route: `GET /api/admin/analytics?range=today|7d|28d`
- Auth: existing `requireAuth` (Bearer JWT), same pattern as other admin APIs.
- Library: `@google-analytics/data` (`BetaAnalyticsDataClient` or current stable client).
- Credentials: construct from `GA_CLIENT_EMAIL` + `GA_PRIVATE_KEY` (replace `\\n` → newline); property as `properties/{GA_PROPERTY_ID}`.
- Default range: `7d` if omitted / invalid.
- Date ranges (GA `dateRanges`):
  - `today` → startDate `today`, endDate `today`
  - `7d` → startDate `7daysAgo`, endDate `today`
  - `28d` → startDate `28daysAgo`, endDate `today`
- Metrics / dimensions (v1):

| Block | Metrics | Dimensions | Limit |
|-------|---------|------------|-------|
| Totals | `activeUsers`, `screenPageViews` | — | — |
| Top pages | `screenPageViews` | `pagePath` | top 10 |
| Sources | `activeUsers` | `sessionDefaultChannelGroup` | top 10 |
| Devices | `activeUsers` | `deviceCategory` | all |
| Countries | `activeUsers` | `country` | top 10 |

Sources use GA4 default channel group (Direct / Organic Search / Referral / etc.), not raw `sessionSource` hostnames.

- Response JSON:

```ts
type AnalyticsRange = "today" | "7d" | "28d"

type AnalyticsResponse = {
  configured: true
  range: AnalyticsRange
  totals: { activeUsers: number; screenPageViews: number }
  topPages: { path: string; views: number }[]
  sources: { source: string; users: number }[]
  devices: { device: string; users: number }[]
  countries: { country: string; users: number }[]
}
```

- If any of `GA_PROPERTY_ID` / `GA_CLIENT_EMAIL` / `GA_PRIVATE_KEY` missing → **503** with `{ configured: false }`.
- GA / auth errors → **502** with a generic message (no private key leakage).
- Cache: in-memory or `Cache-Control` / Next `unstable_cache` ~10 minutes keyed by range, to respect API quotas.

## Admin UI

- Dashboard (`apps/web/src/app/admin/dashboard/page.tsx`): new **Traffic** section near the top (above or just below existing CMS stat tiles).
- New client component e.g. `apps/web/src/components/admin/traffic-analytics.tsx`:
  - Range toggle (today / 7d / 28d)
  - Two summary cards (users, page views)
  - Four panels: top pages, sources, devices, countries (compact tables or small bars using existing Recharts / card patterns from `PostStats`)
  - Loading skeletons; `configured: false` empty state with short setup hint (env vars, no secret values)
- Fetch via existing `apiFetch` + Bearer token.
- i18n keys in `apps/web/src/lib/i18n/admin.ts` (zh + en).

## Deploy notes

| Host | Client gtag | Admin reports |
|------|-------------|-----------------|
| Vercel | Yes if public env set | Yes if server env set |
| GitHub Pages export | Yes if public env set at build | No (no `/api`) |
| Local dev | Yes | Yes if `.env.local` complete |

## Security

- Data API credentials never exposed to the client.
- Analytics route requires admin auth.
- Do not log private keys or full service-account JSON.

## Testing / verification

- Manual: public page network tab shows gtag with measurement ID.
- Manual: admin dashboard with full env shows numbers; with env stripped shows empty state.
- No new unit-test harness required unless the repo already has one for API helpers.

## File touch list (expected)

| Path | Change |
|------|--------|
| `apps/web/package.json` | `@next/third-parties`, `@google-analytics/data` |
| `apps/web/.env.local.example` | Document GA vars |
| `apps/web/src/app/layout.tsx` | Conditional `GoogleAnalytics` |
| `apps/web/src/app/api/admin/analytics/route.ts` | New authenticated report proxy |
| `apps/web/src/lib/ga-analytics.ts` (or similar) | Client + report helpers |
| `apps/web/src/components/admin/traffic-analytics.tsx` | Dashboard UI |
| `apps/web/src/app/admin/dashboard/page.tsx` | Mount traffic section |
| `apps/web/src/lib/i18n/admin.ts` | Strings |
| `README.md` / `README.zh-CN.md` | Brief env note (optional, keep short) |
