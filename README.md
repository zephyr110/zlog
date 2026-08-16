# Zlog

English | [简体中文](./README.zh-CN.md)

A minimal, fast, and bilingual personal blog with a local admin CMS. Built with [Next.js](https://nextjs.org) 16 (App Router), [Tailwind CSS](https://tailwindcss.com) 4, [shadcn/ui](https://ui.shadcn.com), [MDX](https://mdxjs.com), and [Turso](https://turso.tech) (libSQL). One codebase, two deployment targets — both read posts from the same Turso database.

Live (Vercel): [zephyr110.vercel.app](https://zephyr110.vercel.app)

Static mirror (GitHub Pages): [zephyr110.github.io](https://zephyr110.github.io)

Live demo (visitor playground): [zlog-test.vercel.app](https://zlog-test.vercel.app) — browse the blog and sign in to the admin at `/admin` with `admin-test` / `admin123456` (password changes are blocked and analytics are mocked in the demo; credentials are pre-filled on the login form)

![home_dark](https://cdn.jsdelivr.net/gh/zephyr110/blog-img/1786200886932-zephyr110.vercel.app___1_.png)

![alt text](https://cdn.jsdelivr.net/gh/zephyr110/blog-img/1786337581535-zephyr110.vercel.app_admin_dashboard_macbook_pro_1.png)

![home_light](https://cdn.jsdelivr.net/gh/zephyr110/blog-img/1786200944045-zephyr110.vercel.app___2_.png)

![alt text](https://cdn.jsdelivr.net/gh/zephyr110/blog-img/1786337593021-zephyr110.vercel.app_admin_dashboard_macbook_pro_1.png)

## Features

- **Two deploy targets** — Vercel (SSR + admin) and GitHub Pages (static export); Turso is the single data source
- **Blog pages** — sitemap, RSS, and Open Graph built in
- **Admin CMS** — write, edit, publish, and delete posts from `/admin` (Vercel / local `pnpm dev`)
- **Hardened auth** — bcrypt (cost 12) + JWT, login-failure lockout, recovery key
- **Media library** — auto WebP compression, Turso storage + GitHub/jsdelivr CDN dual-write
- **Custom logo & favicon** — upload your own logo in Site Settings; the favicon follows it automatically
- **Bilingual & themable** — zh/en switching, light/dark/system themes
- **Self-hosted comments** — guest comments with no login required; Cloudflare Turnstile + rate limits + content filters against spam; unread-badge inbox in the admin panel. Turnstile keys are configured in the desktop app Settings → Comments and are carried into Vercel deploys automatically
- **Traffic analytics** — optional dual sources on the admin dashboard (Vercel / local `pnpm dev`): **Vercel Analytics** (default) and **GA4** Data API, with a site-wide GA4 gtag when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set
- **Pre-commit checks** — Husky runs `pnpm check` (ESLint + `tsc --noEmit`) before each commit

## Architecture

pnpm workspace monorepo:

| Package | Role |
|---------|------|
| `apps/web` | Next.js app — blog pages + admin panel |
| `packages/database` | Turso (libSQL) access — posts, media, settings, users, auth lockout |
| `packages/auth` | Credential verification, JWT sessions, login lockout |
| `packages/core` | Shared domain logic — MDX utilities, types |

## Deployment

Both targets share one Turso database. They differ in **when** posts are read and whether the admin API is available.

### 0. First-time setup (no accounts yet)

If you have **no GitHub / Vercel / Turso accounts** yet, this is the
one-time path to get a blog that anyone can visit:

1. **Create a Turso database** at https://turso.tech → create a DB →
   note the `libsql://…` URL and generate an auth token.
2. **Deploy the app** at https://vercel.com → *Add New → Project* →
   import this repository (you can fork it first, or import directly
   from GitHub) → Root Directory `apps/web` → Build Command `pnpm build`.
3. **Set Vercel environment variables** (Project → Settings →
   Environment Variables) — all five are required:
   - `TURSO_DATABASE_URL` = `libsql://…` from step 1
   - `TURSO_AUTH_TOKEN` = the token from step 1
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` — generate the hash with
     `node -e "const b=require('bcryptjs');b.hash('YOUR_PASSWORD',10).then(h=>console.log(Buffer.from(h).toString('base64')))"`
   - `SESSION_SECRET` — `openssl rand -hex 32`
4. **Redeploy** the project after saving env vars (Deployments → ⋯ →
   Redeploy), then visit your `*.vercel.app` URL.

Writing then happens in two places, both syncing to the same Turso DB:

- **Desktop app** — Settings → Sync, paste the same `libsql://` URL and
  token; posts you publish sync up and are live on the web within ~60s
  (no redeploy needed for content).
- **Local `pnpm dev`** — add the sync config to `apps/web/.env.local`
  (see the template): `TURSO_DATABASE_URL=file:./bitlog.db`,
  `TURSO_SYNC_URL=<libsql://…>`, `TURSO_AUTH_TOKEN=…`. The local
  SQLite file becomes an embedded replica of Turso — writes sync
  automatically.

See the [deployment guide](https://zlog-test.vercel.app/posts/zlog-deployment-guide)
for diagrams and checklists (English: [zlog-deployment-guide-en](https://zlog-test.vercel.app/posts/zlog-deployment-guide-en)).

### 1. Vercel (SSR + admin)

Full Next.js server deployment. Blog pages and `/api/*` run as Server Components / Route Handlers and query Turso **on each request** (CDN `s-maxage=60`). `/admin` works in production.

| | |
|---|---|
| Build | `pnpm build` |
| Data | Request-time from Turso |
| Content updates | Publish in `/admin` → live within ~60s; **no redeploy** for posts |
| Code updates | Push `main` → Vercel rebuilds the app |
| Secrets | Vercel Environment Variables (`TURSO_*`, `SESSION_SECRET`, optional `GA_*` / `VERCEL_*` analytics, …) |

Setup: import the repo → Root Directory `apps/web` → Build Command `pnpm build` → set env vars. Do **not** use `pnpm export` on Vercel (that drops SSR and admin).

### 2. GitHub Pages (static export)

CI runs `pnpm export` (`NEXT_EXPORT=true`), queries Turso **at build time**, and publishes pure HTML/CSS/JS from `apps/web/out`. No `/api` or `/admin` on the static host.

| | |
|---|---|
| Build | `pnpm export` via `.github/workflows/deploy.yml` |
| Data | Build-time snapshot from Turso |
| Content updates | Only after the next Actions run |
| Code / content refresh | Push `main` (or `workflow_dispatch`) → Actions rebuilds |
| Secrets | GitHub Actions Secrets (`TURSO_*`, `GH_PAT`) |

Writing happens on local `pnpm dev` or on the Vercel `/admin`; the Pages site is a static mirror refreshed by CI.

See the [deployment guide](https://zlog-test.vercel.app/posts/zlog-deployment-guide) for diagrams and checklists (English: [zlog-deployment-guide-en](https://zlog-test.vercel.app/posts/zlog-deployment-guide-en)).

## Desktop App (macOS / Windows / Linux)

Download the latest installer from [GitHub Releases](https://github.com/zephyr110/zlog/releases/latest):

| Platform | Installer |
|---|---|
| macOS (Intel) | [`Zlog-<version>-x64.dmg`](https://github.com/zephyr110/zlog/releases/latest/download/Zlog-1.0.2-x64.dmg) |
| macOS (Apple Silicon) | [`Zlog-<version>-arm64.dmg`](https://github.com/zephyr110/zlog/releases/latest/download/Zlog-1.0.2-arm64.dmg) |
| Windows | [`Zlog-Setup-<version>.exe`](https://github.com/zephyr110/zlog/releases/latest/download/Zlog-Setup-1.0.2.exe) |
| Linux (AppImage) | [`Zlog-<version>-x86_64.AppImage`](https://github.com/zephyr110/zlog/releases/latest/download/Zlog-1.0.2-x86_64.AppImage) |
| Linux (deb) | [`Zlog-<version>-amd64.deb`](https://github.com/zephyr110/zlog/releases/latest/download/Zlog-1.0.2-amd64.deb) |

Run the whole blog — reading and writing — as a desktop application. The
app bundles a local standalone server and a local SQLite database; when a
sync URL is configured it keeps the local copy in two-way sync with your
Turso database (offline writes sync back when you are online).

- Build: `pnpm --filter @zlog/desktop package` (per platform)
- Dev: `pnpm --filter @zlog/desktop build:standalone && pnpm --filter @zlog/desktop dev`
- First launch: create your admin account; optionally paste your Turso
  database URL + token in the wizard to enable sync.
- Data & logs: user data directory (`zlog.db`, `zlog-config.json`,
  `logs/`). Back up the directory to back up the blog.

### macOS first install (unsigned builds)

Release builds are ad-hoc signed but not notarized (no Apple Developer
account), so Gatekeeper shows a warning on first launch:

1. Download the `.dmg` from Releases and drag `Zlog.app` into
   `Applications`.
2. First open: **right-click the app → Open → Open** (confirm once;
   macOS remembers the approval afterwards). Alternatively run
   `xattr -dr com.apple.quarantine /Applications/Zlog.app` in Terminal.
3. If you see "Zlog can no longer be opened" after replacing an older
   installed version, run `xattr -cr /Applications/Zlog.app` and open it
   again — the signature is ad-hoc, so LaunchServices caches the old
   registration until the extended attributes are cleared.

Fully silent installs (double-click, no prompts) require signing with an
Apple Developer ID certificate and notarization.

> Unsigned builds: macOS Gatekeeper and Windows SmartScreen will warn —
> right-click → Open on macOS, "More info → Run anyway" on Windows.

> Analytics note: the desktop app's traffic reports are a read-only
> dashboard for the **online** site (configured in app Settings, or via
> the usual env vars on Vercel). The desktop never sets
> `NEXT_PUBLIC_GA_MEASUREMENT_ID` — local visits must not pollute your
> GA4 data.

## Running web + desktop together (account model)

The web deploy (Vercel), the desktop app and Turso are one system. Three
rules keep all of them working at once:

1. **One database.** Point the desktop's sync URL/token and the Vercel
   `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` at the **same** Turso
   database. That single DB is the shared source of truth.
2. **One admin account.** The `users` table has a single row, seeded
   from env only when the table is empty ("seed on first login").
   Use the **same username and password** for the desktop wizard and
   for Vercel's `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`. If the two ends
   seed different passwords before the first sync converges, the sync
   (last-write-wins) overwrites one of them and that end can no longer
   log in.
3. **Order: web first, then desktop.** Deploy Vercel and log in once to
   seed the admin, then install the desktop app and enter the same
   credentials in the wizard. After the first sync both ends log in
   with the same password. (Desktop `SESSION_SECRET` is generated per
   install and independent of Vercel's — no conflict.)

The image-hosting repo (`BLOG_IMG_*`) is **optional** everywhere: media
bytes live in the Turso database and sync with it, so the desktop app
needs no GitHub token at all; on Vercel, unset `BLOG_IMG_*` just means
images are served from the database API instead of the jsdelivr CDN.
GitHub Pages (static mirror) additionally needs `GH_PAT`, unrelated to
the desktop app.

Design spec: `docs/superpowers/specs/2026-08-13-desktop-app-design.md`

## Getting Started

### Prerequisites

Node.js 20+ · pnpm 11+ (see root `packageManager`)

### Install & run

```bash
pnpm install      # also installs Husky git hooks via prepare
cd apps/web && cp .env.local.example .env.local   # fill in the values
pnpm dev          # blog at :3000, admin at /admin/login
```

Key env vars: `TURSO_DATABASE_URL` (use `file:./zlog.db` for local dev), `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` (seed the admin user on first login), `NEXT_PUBLIC_SITE_URL`, and for guest comments `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` (free Cloudflare Turnstile widget — see `apps/web/.env.local.example` for the local-dev test keys).

Optional Traffic analytics (admin dashboard, Vercel / local only):

- **Vercel Analytics** (default source in the UI): `VERCEL_API_TOKEN`, `VERCEL_ANALYTICS_PROJECT_ID`, optional `VERCEL_ANALYTICS_TEAM_ID`
- **GA4**: `NEXT_PUBLIC_GA_MEASUREMENT_ID` (public gtag), plus server-only `GA_PROPERTY_ID` / `GA_CLIENT_EMAIL` / `GA_PRIVATE_KEY`. Enable the **Google Analytics Data API** on the GCP project and add the service account as **Viewer** on the GA4 property

Details: `apps/web/.env.local.example` and the [deployment guide](https://zephyr110.vercel.app/posts/zlog-deployment-guide).

Create or reset the admin user without env vars:

```bash
pnpm create-admin --username admin --password "your-password"
```

### Build & quality checks

```bash
pnpm build       # Vercel / Node — SSR + admin
pnpm export      # static export to apps/web/out (GitHub Pages)
pnpm check       # lint + typecheck (also run by Husky on commit)
```

Skip hooks when needed: `HUSKY=0 git commit …`.

## License

MIT
