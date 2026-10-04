# Share card generator — design

A share menu on public post pages opens a dialog that renders a 1080×1440 poster — full-bleed curated photo, bottom scrim, auto-sized title, QR code + domain · date — entirely in the browser, then offers download / copy / native share. Click-triggered: nothing is generated until the reader opens it.

## Goals

- Post page share row (top and bottom) hosts one "share" menu button whose dropdown offers "copy link" and "share card" (v2.3; originally two side-by-side icon buttons).
- Card composition: curated free photo cover-cropped to the frame → dark bottom scrim → footer of two rows — title (left-aligned, full width, wrapped up to 3 lines with a font-size ladder and adjacent-line balancing, "…" beyond); below it the white rounded QR tile at the left margin (sharing the title's left edge), with the caption (date on top, domain below, one left edge) tucked 40 px to the tile's right and vertically centered on it — title and tile share a single left axis.
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
| `layoutTitle(measureText, text, maxWidth, maxLines)` | Tries the ladder 96/84/72/60 px, wraps with real text widths, then balances adjacent lines (no orphan last line), returns `{ fontSize, lines }`; over-wide words hard-break per character; ellipsis on overflow |
| `shareCardFilename(slug)` | `zlog-<slug>.jpg` |

`measureText` is injected (canvas `ctx.measureText` in production, a CJK=1em/latin=0.5em fake in tests) so the layout logic is unit-testable without a canvas.

### Dialog — `apps/web/src/components/blog/share-card-dialog.tsx`

Pipeline per open / reroll:

1. `loadImage(poolUrl, { crossOrigin: "anonymous" })`; on error → brand gradient fill.
2. Draw cover-cropped image → bottom scrim (transparent → `rgba(0,0,0,.72)`, bottom ~45%).
3. Title via `layoutTitle`, white, up to 3 lines, full content width.
4. QR: `await import("qrcode-generator")` (tiny MIT encoder, no runtime deps — loaded only when the dialog opens, never in the main bundle) → module matrix → draw onto an offscreen canvas (2-module quiet zone, so the white margin stays minimal) → composite a white rounded tile (8 px padding) at the left margin, caption (`date` over `domain`) tucked 40 px to its right and vertically centered (v2.2).
5. Preview is the live canvas, scaled into the 32 rem dialog (55 vh height cap); action row below, four buttons on one line.

Actions:

| Action | Behavior |
|--------|----------|
| 换一张 | Reroll background (exclude current), redraw |
| 下载 | `toBlob("image/jpeg", 0.92)` → `<a download="zlog-<slug>.jpg">` |
| 复制图片 | `ClipboardItem({"image/png": …})`; button hidden when unsupported |
| 分享… | `navigator.share({ files, title, url })`; button shown only when `canShare({ files })` passes |

QR content: the canonical absolute post URL, passed down from the server component as a prop (not `window.location.origin`, which is `file://` inside the desktop shell and would encode an unscannable address).

### Data flow

Post page (server) → `<ShareMenu url={siteUrl + "/posts/<slug>"} slug title date />` in both share rows → menu (copy link immediate / share card) → dynamic `import()` of the dialog → canvas render → preview → export actions.

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
| `apps/web/src/components/blog/share-menu.tsx` | Share menu (copy-link / share-card items) wrapping the lazy `ShareCardDialog`; renamed from `share-buttons.tsx` in v2.3 |
| `apps/web/src/app/posts/[slug]/page.tsx` | Pass canonical URL/title/date; render the share menu in both share rows |
| `apps/web/src/lib/i18n/post.ts` | New post-page keys (zh/en) |
| `apps/web/package.json` | Add QR encoder dependency |
| `apps/web/test/share-card.test.ts` | New unit tests |

No DB, API, or export-chain changes.

## Revision — 2026-10-04

Post-launch feedback (v2): the site mark (dot + site name) is removed from the card; the footer becomes two lines (title, then QR + domain · date side by side); the QR quiet zone shrinks 4 → 2 modules and tile padding 16 → 8 px; the dialog widens 24 → 28 rem so all four actions fit one row. `siteName` dropped from the component chain accordingly.

Oversized-title pass (v2.1): wrapping gains adjacent-line balancing — after the greedy wrap, tokens move between neighboring lines while that strictly narrows their width difference (and the receiver stays within the line), which removes orphan last lines (a 13-char CJK title at 96 px used to wrap 6/6/1, now 5/4/4). Tokens wider than the line itself (long words/URLs) hard-break per character instead of overflowing the canvas. A space exposed at a line's end by a balancing move is re-trimmed before the next move, so a line never starts with a stray space. All three behaviors are unit-tested with the fake measure.

Footer pass (v2.2): the footer's second row becomes one grouped block — the QR tile keeps the left margin (sharing the title's left edge) and the caption (date above domain, one left edge) tucks 40 px to its right, vertically centered on the tile (40 px between the two caption lines, matching the title rhythm). Earlier in the pass the caption was tried right-aligned in the corner, then bottom-aligned with the tile against the right margin; both split the footer into two far-apart elements across ~400 px of dead space, so the grouped left-axis version won. The dialog widens 28 → 32 rem so the four action buttons stay on one row in English too ("Download image" / "Copy image" are ~40 px longer than their Chinese labels).

Share-entry pass (v2.3): the two side-by-side icon buttons (copy link, share card) collapse into one "share" menu whose dropdown holds both actions, each with an output-semantics icon (Link / Image), copy link staying one click away. The pair read as two share buttons — the card button wore the generic share glyph — so the menu removes the icon ambiguity without dropping either output; the popup width is decoupled from the icon-button anchor. `ShareCardButton`/`CopyLinkButton` become a single `ShareMenu` (file renamed `share-buttons.tsx` → `share-menu.tsx`); new `post.share` i18n key (zh/en).
