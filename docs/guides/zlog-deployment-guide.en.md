# Zlog Deployment Guide (English)

Zlog is a blog system with a built-in admin panel: the desktop app ships a complete web server and writing dashboard. You can use it locally, sync to a cloud database, or publish to the public web in one click. This guide covers the three scenarios, from simple to advanced.

---

## Scenario 1: Local Use (Out of the Box)

**Best for:** writers who just want a private blog, no public access needed.

**Steps:**

1. Install the Zlog desktop app (macOS / Windows) and open it.
2. First launch completes initialization automatically: set the admin account in Settings → Account; the local database is created alongside the app.
3. Click "Open Admin" to start writing: Markdown support, post covers, tags, comment moderation, media library, and a traffic dashboard.

**Highlights:**

- Zero configuration; data stays on your machine (under `~/Library/Application Support/@zlog`), fully offline.
- The blog is only reachable locally (`http://localhost:<port>`) — great for private notes or previewing.

---

## Scenario 2: Local + Turso Cloud Sync (Data in the Cloud)

**Best for:** users who want a safe backup and consistent content across devices.

**Steps:**

1. Sign up at [Turso](https://turso.tech) (free tier is enough for a personal blog), create a database, and note the `libsql://...` connection URL and token.
2. In Zlog Settings → "Sync", paste:
   - Database URL: `libsql://xxx.turso.io`
   - Token: a read/write token from the Turso console
3. Click "Save & Sync" — from then on every post and upload syncs to the cloud database automatically.

**Highlights:**

- Local use stays fast; the cloud database is a safe backup and the source of truth for multiple devices.
- No data loss: on a new machine, install Zlog and paste the same connection URL to restore everything.
- Note: only data is synced — the blog pages are still not public.

---

## Scenario 3: One-Click Deploy to Vercel (Go Public)

**Best for:** users who want a public website others can visit.

**Prerequisite:** complete Scenario 2 first — the deploy step writes your sync credentials into the production environment automatically.

**Steps:**

1. Sign up at [Vercel](https://vercel.com) and create an API Token (Settings → Tokens → Create Token).
2. In Zlog Settings → "Go Live" panel:
   - Paste the token
   - Project name: leave blank (auto-generated) or customize
3. Click "Deploy": the app automatically runs validate token → create project → set environment variables → upload code → cloud build, about 2–5 minutes.
4. When done, a public URL appears (e.g. `https://your-project.vercel.app`) — share it with anyone.

**Highlights:**

- Fully graphical: no Git, no terminal, no manual environment variables.
- The admin and the site share one dataset (the Turso cloud database): publishing posts and managing the backend work exactly as locally.
- Admin operations (write posts, manage media) behave the same as local; images are handled automatically (GitHub token enables CDN acceleration; without one, images are served from the database — functionality is unaffected).

---

## FAQ

**Q: Forgot the admin password?**
A: Regenerate a recovery key in Settings → Account, or re-initialize the local config.

**Q: How do I update the deployed site?**
A: Click "Deploy" again in the desktop app — it overwrites the live version and reuses environment variables.

**Q: Are the free tiers enough?**
A: Vercel Hobby and the Turso free plan comfortably cover a personal blog (a few hundred visits/day, dozens of posts).
