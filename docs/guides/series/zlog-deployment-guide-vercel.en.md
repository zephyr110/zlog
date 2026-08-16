# Zlog Deployment Guide (3/3): One-Click Deploy to Vercel

The final post: publish your blog as a public website. The only prerequisite is [Turso sync from part 2](zlog-deployment-guide-sync-en) (the deploy writes your sync credentials into the production environment automatically) plus a Vercel account.

## Why Vercel

- **Free**: the Hobby plan covers a personal blog (100GB bandwidth/month, unlimited static requests).
- **Fully automatic**: posts, images, and comments all live in the same cloud DB — the admin and the site stay identical.
- **No terminal**: no Git, no shell, no manual environment variables.

## Step 1: Sign Up for Vercel and Create a Token

1. Open [Vercel](https://vercel.com) and sign up (one-click with GitHub / Google).
2. Avatar (top-right) → **Settings → Tokens → Create Token**:
   - Name it anything (e.g. `zlog-deploy`)
   - Scope: your account
   - Click Create and **copy the token immediately** (shown once), it looks like `vcp_...`

## Step 2: One-Click Deploy in the Desktop App

1. Open Zlog → Settings → **Go Live** panel.
2. Paste the token; project name can stay empty (auto-generated, e.g. `zlog-blog-xxx`) or be customized.
3. Click **Deploy** — the app automatically:

   ```
   validate token → create Vercel project → set environment variables
   → upload code → cloud build (2–5 min) → return the public URL
   ```

4. When done, the panel shows the public URL (e.g. `https://your-project.vercel.app`) — copy and share it.

## After Deployment

- **Writing**: posts written in the desktop app or the online admin (`/admin`) go to the same Turso DB; they're live on the site within ~60s, no redeploy needed.
- **Code updates**: click **Deploy** again to overwrite the live version; environment variables are reused.
- **Images**: media is handled automatically — with a GitHub image-repo token it's served via CDN; without one, images come straight from the database. Functionality is unaffected.

## FAQ

**Q: The deploy says the token is invalid?**
A: Make sure you pasted the full token (starts with `vcp_`) and copied it before closing the creation page.

**Q: How long does a deploy take?**
A: Upload ~1 minute, cloud build 2–5 minutes. You can cancel mid-way.

**Q: Can I change the password on the live admin?**
A: Yes, identical to local. Forgot it? Reset via Settings → Account in the desktop app.

**Q: How do I enable comment spam protection?**
A: In the desktop app, open Settings → Comments and paste the Cloudflare Turnstile Site Key and Secret Key (create a site in the [Turnstile console](https://dash.cloudflare.com/?to=/:account/turnstile) to get both). Local comments get human verification immediately, and one-click deploys carry the keys over automatically — the live site is protected the same way.

**Q: Want your own domain?**
A: Vercel console → project → **Settings → Domains**, add your domain and follow the DNS prompts — live within minutes.

---

Series recap:
- [Part 1: Which mode should you choose?](zlog-deployment-guide-en)
- [Part 2: Turso cloud sync](zlog-deployment-guide-sync-en)
- Part 3: One-click Vercel deploy ← you are here

That's it — a blog you can write from any device and share with anyone. Happy writing!
