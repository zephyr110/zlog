# Zlog Deployment Guide (2/3): Turso Cloud Sync

The first post covered the three modes; this one is step two: sync your blog to a Turso cloud database — local use stays fast, and the cloud copy is a safe backup and the source of truth for multiple devices.

## Why Sync

- **Data safety**: posts, images, and comments live on this machine. If the disk dies or the directory is deleted, everything is gone. Synced, the cloud DB is a real-time backup.
- **Multi-device consistency**: install Zlog on a desktop and a laptop, paste the same connection URL, and content stays in sync.
- **Ready for publishing**: the Vercel deploy reuses these exact sync credentials — see part 3.

## Step 1: Sign Up for Turso and Create a Database

1. Open [Turso](https://turso.tech) and sign up (the free tier covers a personal blog: hundreds of thousands of rows, unlimited reads).
2. In the console click **Create Database**, pick a name (e.g. `my-blog`), and choose a region close to you (e.g. Tokyo / Singapore).
3. On the database page grab two things:
   - **URL**: e.g. `libsql://my-blog-username.aws-ap-northeast-1.turso.io`
   - **Token**: click **Generate Token** and create a read/write token — copy it immediately; it is shown only once.

## Step 2: Fill in the Sync Settings in the Desktop App

1. Open Zlog → Settings → **Sync**.
2. Paste:
   - **Database URL**: the `libsql://...` connection URL
   - **Token**: the token from step 1
3. Click **Save & Sync** — the app runs a full sync immediately; from then on every post, upload, and comment syncs automatically.

## Verify & Day-to-Day

- Sync status is visible in Settings (last sync time / error hints).
- New machine: install Zlog → paste the same connection URL → everything is restored.
- To confirm, open **Explore Data** in the Turso console and check the `posts` and `media` tables.

## Notes

- **Token scope**: use a read/write token (you need to write); a read-only token makes saves fail.
- **Free tier**: Turso's free plan has storage/row limits (a personal blog stays far below them); the console warns before you'd ever hit them.
- **Offline**: the local DB is an embedded replica — you can write offline, and changes sync back when you're online.

Next: [One-Click Deploy to Vercel](zlog-deployment-guide-vercel-en)
