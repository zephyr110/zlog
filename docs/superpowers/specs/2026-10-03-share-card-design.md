# Share card generator — design

A new share-row button on public post pages opens a dialog that renders a 1080×1440 poster — full-bleed curated photo, bottom scrim, site mark, auto-sized title, QR code + domain · date — entirely in the browser, then offers download / copy / native share. Click-triggered: nothing is generated until the reader opens it.

## Goals

- Post page share row (top and bottom) gains a "share card" icon button beside the existing copy-link button.
- Card composition: curated free photo cover-cropped to the frame → dark bottom scrim → site mark top-left (accent dot + site name, echoing the existing OG card) → title, greedy-wrapped up to 3 lines with a font-size ladder, "…" beyond → white rounded QR tile (with quiet zone) bottom-right + domain · date.
- Works on the static export (GitHub Pages): no route handler, no server — all client-side canvas. (The `/api/og/[slug]` satori pipeline cannot serve this: the public reading surface is the export, where route handlers are stashed.)
- Background is stable by default: seeded from the post slug, so every reader sharing the same post gets the same image; a reroll button draws a different one.
- Actions: download JPEG (photo-backed PNG would be 3 MB+), copy image as PNG (`ClipboardItem`), native share with the file (`navigator.canShare({files})`).

## Non-goals

- No server-side rendering of share cards; `/api/og` remains the crawler unfurl path, untouched.
- No admin/editor surface, no per-post card customization UI, no text editing on the card.
- No self-hosted background library (photos stay hotlinked; see below), no user-supplied upload.
- No themes/light-dark variants — one poster treatment.
- No analytics or tracking of card generation.

## Approach

Canvas pipeline in a dialog, client-only. Chosen over a satori route because the public site is a static export with no route handlers; client-side also gives instant reroll and zero server cost.

### Background pool

`SHARE_BG_POOL` in `apps/web/src/lib/share-card.ts`: ~24 curated Unsplash direct URLs (`https://images.unsplash.com/photo-<id>?…&w=1080&q=80&fm=jpg&fit=crop`), each verified HTTP 200 during implementation. Unsplash License (free for commercial use); hotlinked so the repo and bundles stay lean — the CDN is stable and sends `access-control-allow-origin: *` for browser requests (verified with an Origin header, which is the gate for canvas export). Load failure falls back to a brand gradient so the card always renders.

### Pure helpers — `apps/web/src/lib/share-card.ts`

| Export | Role |
|--------|------|
| `SHARE_SIZE` | `{ width: 1080, height: 1440 }` |
| `pickBackground(seed, excludeIndex?)` | FNV-1a hash of the slug → pool index; reroll passes the current index to draw a different one |
| `layoutTitle(measureText, text, maxWidth, maxLines)` | Tries the ladder 96/84/72/60 px, greedy-wraps with real text widths, returns `{ fontSize, lines }`; ellipsis on overflow |
| `shareCardFilename(slug)` | `zlog-<slug>.jpg` |

`measureText` is injected (canvas `ctx.measureText` in production, a CJK=1em/latin=0.5em fake in tests) so the layout logic is unit-testable without a canvas.

### Dialog — `apps/web/src/components/blog/share-card-dialog.tsx`

Pipeline per open / reroll:

1. `loadImage(poolUrl, { crossOrigin: "anonymous" })`; on error → brand gradient fill.
2. Draw cover-cropped image → bottom scrim (transparent → `rgba(0,0,0,.72)`, bottom ~45%).
3. Site mark: accent dot + site name, white.
4. Title via `layoutTitle`, white, up to 3 lines.
5. QR: `await import("qrcode-generator")` (tiny MIT encoder, no runtime deps — loaded only when the dialog opens, never in the main bundle) → module matrix → draw onto an offscreen canvas → composite a white rounded tile (4-module quiet zone) + `domain · date` caption.
6. Preview is the live canvas, CSS-scaled to the dialog width; action row below.

Actions:

| Action | Behavior |
|--------|----------|
| 换一张 | Reroll background (exclude current), redraw |
| 下载 | `toBlob("image/jpeg", 0.92)` → `<a download="zlog-<slug>.jpg">` |
| 复制图片 | `ClipboardItem({"image/png": …})`; button hidden when unsupported |
| 分享… | `navigator.share({ files, title, url })`; button shown only when `canShare({ files })` passes |

QR content: the canonical absolute post URL, passed down from the server component as a prop (not `window.location.origin`, which is `file://` inside the desktop shell and would encode an unscannable address).

### Data flow

Post page (server) → `<ShareCardButton url={siteUrl + "/posts/<slug>"} title date slug />` in both share rows → click → dynamic `import()` of the dialog → canvas render → preview → export actions.

### Error / fallback

- Background image fails → brand gradient; card still renders.
- QR encoder import fails → QR tile omitted, caption stays.
- Clipboard / share APIs unsupported → those buttons are simply not rendered (progressive enhancement).
- `toBlob` returns null → error toast, no dead download.

### Testing

- Unit (`apps/web/test/share-card.test.ts`): `pickBackground` determinism + exclude behavior, `layoutTitle` ladder/wrap/ellipsis with the fake measure, `shareCardFilename`.
- Manual CDP: open a post, click the button, assert the canvas has meaningful pixel variance (not blank) and the QR region is non-uniform, run a download, and eyeball the exported poster; screenshot both dialog and final card.
- Gates as usual: lint / typecheck / vitest; plus a local `pnpm export` build (the change adds a client component to a server page — the export build must stay green).

## File touch list

| Path | Change |
|------|--------|
| `apps/web/src/lib/share-card.ts` | New: pool, PRNG, title layout, filename |
| `apps/web/src/components/blog/share-card-dialog.tsx` | New: canvas pipeline + actions |
| `apps/web/src/components/blog/share-buttons.tsx` | Add `ShareCardButton` (lazy dialog) |
| `apps/web/src/app/posts/[slug]/page.tsx` | Pass canonical URL/title/date; render button in both share rows |
| `apps/web/src/lib/i18n/post.ts` | New post-page keys (zh/en) |
| `apps/web/package.json` | Add QR encoder dependency |
| `apps/web/test/share-card.test.ts` | New unit tests |

No DB, API, or export-chain changes.
