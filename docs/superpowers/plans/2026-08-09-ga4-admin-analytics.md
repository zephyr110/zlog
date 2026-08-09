# GA4 + Admin Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship GA4 client tracking and an authenticated admin dashboard Traffic section backed by the GA4 Data API.

**Architecture:** Public measurement ID drives `@next/third-parties` `GoogleAnalytics` in the root layout. Server-only credentials power `GET /api/admin/analytics` via `@google-analytics/data`. Dashboard mounts `TrafficAnalytics` with range toggles and breakdown panels.

**Tech Stack:** Next.js 16, `@next/third-parties`, `@google-analytics/data`, existing `requireAuth` / `apiFetch` / admin i18n / Card UI.

**Spec:** `docs/superpowers/specs/2026-08-09-ga4-admin-analytics-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/package.json` | Add deps |
| `apps/web/.env.local.example` | Document GA env vars |
| `apps/web/src/app/layout.tsx` | Conditional GA tag |
| `apps/web/src/lib/ga-analytics.ts` | Config check, range map, fetch reports, cache |
| `apps/web/src/app/api/admin/analytics/route.ts` | Auth + JSON API |
| `apps/web/src/components/admin/traffic-analytics.tsx` | Dashboard UI |
| `apps/web/src/app/admin/dashboard/page.tsx` | Mount section |
| `apps/web/src/lib/i18n/admin.ts` | zh/en strings |

---

### Task 1: Dependencies + env example + client tag

- [x] Add `@next/third-parties` and `@google-analytics/data`
- [x] Document env vars in `.env.local.example`
- [x] Inject `GoogleAnalytics` in root layout when measurement ID set

### Task 2: Server report helper + API route

- [x] `ga-analytics.ts` — credentials, ranges, batch reports, 10m cache
- [x] `GET /api/admin/analytics` — requireAuth, 503 unconfigured, 502 on GA errors

### Task 3: Admin UI + i18n

- [x] `TrafficAnalytics` component
- [x] Mount on dashboard (above CMS statistics)
- [x] i18n keys

### Task 4: Verify

- [x] `tsc --noEmit`
- [x] Commit
