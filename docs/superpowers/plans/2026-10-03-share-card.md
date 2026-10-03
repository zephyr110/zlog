# Share card generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Post pages get a "share card" button that renders a 1080×1440 poster (full-bleed curated photo → scrim → site mark → auto-sized title → QR + domain·date) entirely client-side, with download / copy / native-share actions.

**Architecture:** Pure layout/pick logic lives in `apps/web/src/lib/share-card.ts` (unit-testable, no DOM). A lazily-loaded dialog component draws the canvas with real images from a hotlinked Unsplash pool. The post page (server component) passes a canonical absolute URL, so the QR stays scannable from the desktop shell too. Spec: `docs/superpowers/specs/2026-10-03-share-card-design.md`.

**Tech Stack:** Next 16 App Router (static-export-safe client component), React 19, Base UI Dialog/Button, sonner toasts, canvas 2D, `qrcode-generator` (MIT, 2.0.4, bundled types), vitest (node env, `@/` → `src` alias).

**Working agreements (repo rules that override defaults):**
- Repo root for every command: `cd /Users/zephyr/Code/zlog` (isolated worktree — never cd to the original checkout).
- NEVER use `--no-verify`; pre-commit hooks (lint + typecheck + full test suite) must pass normally.
- Commit messages: no `Co-Authored-By` line, ever.
- Do NOT push to main without asking the user first (Task 6).
- The public site is a static export: no route handlers, no server APIs for this feature.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `apps/web/src/lib/share-card.ts` (new) | Background pool, FNV-1a seed → pool index, title layout (ladder + wrap + ellipsis), download filename. Pure, no DOM. |
| `apps/web/test/share-card.test.ts` (new) | Unit tests for the above with a fake `measure`. |
| `apps/web/src/components/blog/share-card-dialog.tsx` (new) | Canvas render pipeline + preview + 4 actions. Lazy-loaded by the button. |
| `apps/web/src/components/blog/share-buttons.tsx` (modify) | Add `ShareCardButton` (lazy dialog, next/dynamic). |
| `apps/web/src/app/posts/[slug]/page.tsx` (modify) | Compute `shareUrl`; render `ShareCardButton` in both share rows. |
| `apps/web/src/lib/i18n/post.ts` (modify) | 7 new keys, zh + en (checker enforces symmetry). |
| `apps/web/package.json` (modify) | `qrcode-generator` dependency. |
| `$CLAUDE_JOB_DIR/tmp/verify-share-card.mjs` (new, not committed) | CDP end-to-end verification script. |

Existing conventions to reuse: `IconButton` + `Tooltip` (share row, see `CopyLinkButton`), `toast` from sonner, `useT()` from `@/components/layout/trans`, dialog primitives in `@/components/ui/dialog`.

---

### Task 1: Pure library + unit tests

**Files:**
- Create: `apps/web/src/lib/share-card.ts`
- Test: `apps/web/test/share-card.test.ts`

- [ ] **Step 1: Verify every background URL is live (network check)**

```bash
cd /Users/zephyr/Code/zlog
for id in \
  photo-1506905925346-21bda4d32df4 photo-1470071459604-3b5ec3a7fe05 \
  photo-1441974231531-c6227db76b6e photo-1501785888041-af3ef285b470 \
  photo-1472214103451-9374bd1c798e photo-1500530855697-b586d89ba3ee \
  photo-1519681393784-d120267933ba photo-1493246507139-91e8fad9978e \
  photo-1469474968028-56623f02e42e photo-1447752875215-b2761acb3c5d \
  photo-1433086966358-54859d0ed716 photo-1505144808419-1957a94ca61e \
  photo-1475924156734-496f6cac6ec1 photo-1497436072909-60f360e1d4b1 \
  photo-1470770841072-f978cf4d019e photo-1458668383970-8ddd3927deed \
  photo-1464822759023-fed622ff2c3b photo-1483728642387-6c3bdd6c93e5 \
  photo-1439066615861-d1af74d74000 photo-1444927714506-8492d94b4e3d \
  photo-1502082553048-f009c37129b9 photo-1439853949127-fa647821eba0 \
  photo-1505765050516-f72dcac9c60e photo-1465101162946-4377e57745c3 ; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Origin: https://zephyr110.github.io" \
    "https://images.unsplash.com/$id?fm=jpg&fit=crop&w=1080&h=1440&q=80")
  echo "$code $id"
done
```

Expected: every line starts with `200`. Replace any non-200 id with a spare from this verified-by-the-same-loop list: `photo-1506744038136-46273834b3fb`, `photo-1426604966848-d7adac402bff`, `photo-1418065460487-3e41a6c84dc5`, `photo-1476514525535-07fb3b4ae5f1`, `photo-1500375592092-40eb2168fd21`, `photo-1441716844725-09cedc13a4e7`. (CORS was already verified for this CDN: `access-control-allow-origin: *` with an Origin header.)

- [ ] **Step 2: Write the failing test**

Create `apps/web/test/share-card.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  SHARE_BG_POOL,
  SHARE_SIZE,
  fnv1a,
  layoutTitle,
  pickBackground,
  shareCardFilename,
} from "@/lib/share-card"

/** 假 measure：CJK/全角 ≈ 1em、其余 ≈ 0.55em —— 够逼近真实排版行为。 */
function fakeMeasure(text: string, fontSize: number): number {
  let width = 0
  for (const ch of text) {
    width += /[　-鿿＀-￯]/.test(ch) ? 1 : 0.55
  }
  return width * fontSize
}

describe("background pool", () => {
  it("holds at least 20 https Unsplash URLs sized for the card", () => {
    expect(SHARE_BG_POOL.length).toBeGreaterThanOrEqual(20)
    for (const url of SHARE_BG_POOL) {
      expect(url.startsWith("https://images.unsplash.com/photo-")).toBe(true)
      expect(url).toContain("w=1080")
      expect(url).toContain("h=1440")
    }
  })

  it("shares the 1080×1440 poster ratio", () => {
    expect(SHARE_SIZE).toEqual({ width: 1080, height: 1440 })
  })
})

describe("fnv1a", () => {
  it("matches the standard FNV-1a 32-bit vectors", () => {
    expect(fnv1a("")).toBe(2166136261) // 0x811c9dc5
    expect(fnv1a("a")).toBe(3826002220) // 0xe40c292c
  })
})

describe("pickBackground", () => {
  it("is deterministic per seed and stays in range", () => {
    for (const seed of ["hello", "系列-1", "a-very-long-slug-2026", ""]) {
      const index = pickBackground(seed)
      expect(index).toBe(pickBackground(seed))
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(SHARE_BG_POOL.length)
    }
  })

  it("never returns the excluded index", () => {
    for (const seed of ["hello", "posts/关于写作", "x"]) {
      const first = pickBackground(seed)
      expect(pickBackground(seed, first)).not.toBe(first)
    }
  })
})

describe("layoutTitle", () => {
  it("keeps a short title on one line at the top of the ladder", () => {
    expect(layoutTitle(fakeMeasure, "你好世界", 640)).toEqual({
      fontSize: 96,
      lines: ["你好世界"],
    })
  })

  it("steps down the ladder to keep a long CJK title within 3 lines", () => {
    // 21 字：96px 每行 6 字 → 4 行；84px 每行 7 字 → 正好 3 行
    const layout = layoutTitle(
      fakeMeasure,
      "这是一个很长的中文标题需要缩小字号才能放下",
      640
    )
    expect(layout.fontSize).toBe(84)
    expect(layout.lines).toHaveLength(3)
  })

  it("wraps latin text on word boundaries, not mid-word", () => {
    expect(layoutTitle(fakeMeasure, "hello world", 320)).toEqual({
      fontSize: 96,
      lines: ["hello", "world"],
    })
  })

  it("ellipsizes at the smallest size when even 60px overflows", () => {
    const layout = layoutTitle(fakeMeasure, "长".repeat(40), 640)
    expect(layout.fontSize).toBe(60)
    expect(layout.lines).toHaveLength(3)
    expect(layout.lines[2].endsWith("…")).toBe(true)
  })

  it("returns no lines for an empty title", () => {
    expect(layoutTitle(fakeMeasure, "   ", 640)).toEqual({
      fontSize: 96,
      lines: [],
    })
  })
})

describe("shareCardFilename", () => {
  it("names the download after the post", () => {
    expect(shareCardFilename("hello-world")).toBe("zlog-hello-world.jpg")
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /Users/zephyr/Code/zlog && pnpm --filter @zlog/web test share-card`
Expected: FAIL — `Failed to resolve import "@/lib/share-card"`.

- [ ] **Step 4: Implement the library**

Create `apps/web/src/lib/share-card.ts` (use the verified ids from Step 1 in `BG_IDS`):

```ts
// 分享卡（1080×1440 海报）的纯逻辑：背景池、稳定选图、标题排版、文件名。
// 画布绘制在 components/blog/share-card-dialog.tsx；这里零 DOM 依赖，
// 用注入的 measure 函数在 vitest（node 环境）里直接单测。

export const SHARE_SIZE = { width: 1080, height: 1440 } as const

/** 精选背景池：Unsplash 直链（Unsplash License，免费商用，热链零仓库增重）。
 *  images.unsplash.com 对带 Origin 的请求返回 access-control-allow-origin: *
 *  —— canvas 跨域绘制并导出可行（实测）。id 均已 curl 验证 200。 */
const BG_IDS = [
  "photo-1506905925346-21bda4d32df4",
  "photo-1470071459604-3b5ec3a7fe05",
  "photo-1441974231531-c6227db76b6e",
  "photo-1501785888041-af3ef285b470",
  "photo-1472214103451-9374bd1c798e",
  "photo-1500530855697-b586d89ba3ee",
  "photo-1519681393784-d120267933ba",
  "photo-1493246507139-91e8fad9978e",
  "photo-1469474968028-56623f02e42e",
  "photo-1447752875215-b2761acb3c5d",
  "photo-1433086966358-54859d0ed716",
  "photo-1505144808419-1957a94ca61e",
  "photo-1475924156734-496f6cac6ec1",
  "photo-1497436072909-60f360e1d4b1",
  "photo-1470770841072-f978cf4d019e",
  "photo-1458668383970-8ddd3927deed",
  "photo-1464822759023-fed622ff2c3b",
  "photo-1483728642387-6c3bdd6c93e5",
  "photo-1439066615861-d1af74d74000",
  "photo-1444927714506-8492d94b4e3d",
  "photo-1502082553048-f009c37129b9",
  "photo-1439853949127-fa647821eba0",
  "photo-1505765050516-f72dcac9c60e",
  "photo-1465101162946-4377e57745c3",
] as const

const BG_PARAMS = "?fm=jpg&fit=crop&w=1080&h=1440&q=80"

export const SHARE_BG_POOL: readonly string[] = BG_IDS.map(
  (id) => `https://images.unsplash.com/${id}${BG_PARAMS}`
)

/** FNV-1a 32 位：同一 slug 稳定映射到池中同一张图（各端分享图一致）。 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** 由 seed 稳定选背景；传入 excludeIndex（当前图）时错开一位。 */
export function pickBackground(seed: string, excludeIndex?: number): number {
  const index = fnv1a(seed) % SHARE_BG_POOL.length
  if (excludeIndex === undefined || index !== excludeIndex) return index
  return (index + 1) % SHARE_BG_POOL.length
}

export type TitleLayout = { fontSize: number; lines: string[] }

/** 字号阶梯：从大到小试，选第一个放得下的。 */
const TITLE_LADDER = [96, 84, 72, 60] as const
export const TITLE_MAX_LINES = 3

type Measure = (text: string, fontSize: number) => number

/** 排版单元：拉丁/数字串保持整词，CJK 与标点逐字，空白可断行。 */
function tokenize(text: string): string[] {
  return text.match(/\s+|[A-Za-z0-9][A-Za-z0-9'’\-_.]*|./gu) ?? []
}

const isSpace = (token: string) => /^\s+$/.test(token)

function wrapOnce(
  measure: Measure,
  tokens: string[],
  fontSize: number,
  maxWidth: number
): string[] {
  const lines: string[] = []
  let line = ""
  for (const token of tokens) {
    if (isSpace(token) && line === "") continue // 行首空白丢弃
    const next = line + token
    if (line !== "" && measure(next, fontSize) > maxWidth) {
      lines.push(line.trimEnd())
      line = isSpace(token) ? "" : token
    } else {
      line = next
    }
  }
  if (line.trim() !== "") lines.push(line.trimEnd())
  return lines
}

/** 标题排版：先按阶梯找放得下的字号；最小号仍超行数时截断加省略号。 */
export function layoutTitle(
  measure: Measure,
  text: string,
  maxWidth: number,
  maxLines: number = TITLE_MAX_LINES
): TitleLayout {
  const tokens = tokenize(text.trim())
  for (const fontSize of TITLE_LADDER) {
    const lines = wrapOnce(measure, tokens, fontSize, maxWidth)
    if (lines.length <= maxLines) return { fontSize, lines }
  }
  const fontSize = TITLE_LADDER[TITLE_LADDER.length - 1]
  const lines = wrapOnce(measure, tokens, fontSize, maxWidth).slice(0, maxLines)
  let cut = lines[maxLines - 1]
  while (cut.length > 0 && measure(cut + "…", fontSize) > maxWidth) {
    cut = cut.slice(0, -1)
  }
  lines[maxLines - 1] = cut.trimEnd() + "…"
  return { fontSize, lines }
}

/** 下载文件名：zlog-<slug>.jpg。 */
export function shareCardFilename(slug: string): string {
  return `zlog-${slug}.jpg`
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/zephyr/Code/zlog && pnpm --filter @zlog/web test share-card`
Expected: 11 tests pass (background pool ×2, fnv1a ×1, pickBackground ×2, layoutTitle ×5, filename ×1). If the ladder test lands on a different size than 84, recount the per-line capacity at 84px — the fixture string must be exactly 21 CJK chars.

- [ ] **Step 6: Typecheck + lint (fast gates)**

Run: `cd /Users/zephyr/Code/zlog && pnpm --filter @zlog/web typecheck && pnpm --filter @zlog/web lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
cd /Users/zephyr/Code/zlog
git add apps/web/src/lib/share-card.ts apps/web/test/share-card.test.ts
git commit -m "feat: 分享卡纯逻辑（背景池/稳定选图/标题排版）+ 单测"
```

---

### Task 2: QR encoder dependency

**Files:**
- Modify: `apps/web/package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install**

```bash
cd /Users/zephyr/Code/zlog && pnpm --filter @zlog/web add qrcode-generator
```
Expected: `qrcode-generator 2.0.4` (MIT; `dist/qrcode.d.ts` ships its own types) added to dependencies.

- [ ] **Step 2: Inspect the module shape so the dialog imports it correctly**

```bash
cd /Users/zephyr/Code/zlog/apps/web && head -30 node_modules/qrcode-generator/dist/qrcode.d.ts
node -e "import('qrcode-generator').then(m => console.log(typeof m.default, typeof m))"
```
Expected: the d.ts declares a callable `qrcode(typeNumber, errorCorrectionLevel)` (UMD `export =`-style); the node probe prints `function function` (default interop) or similar. Task 3's `mod.default ?? mod` cast covers both shapes — note what you saw.

- [ ] **Step 3: Commit**

```bash
cd /Users/zephyr/Code/zlog
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore: 添加 qrcode-generator 依赖（分享卡二维码）"
```

---

### Task 3: Share card dialog component

**Files:**
- Create: `apps/web/src/components/blog/share-card-dialog.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/blog/share-card-dialog.tsx`:

```tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Copy, Download, RefreshCw, Share2 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useT } from "@/components/layout/trans"
import {
  SHARE_BG_POOL,
  SHARE_SIZE,
  layoutTitle,
  pickBackground,
  shareCardFilename,
} from "@/lib/share-card"

const { width: W, height: H } = SHARE_SIZE

// 卡片排版常量（画布坐标，1080×1440）
const MARGIN = 80
const QR_CONTENT = 200 // 含 4 模块 quiet zone
const QR_PAD = 16
const QR_TILE = QR_CONTENT + QR_PAD * 2
const QR_RADIUS = 24
const QR_CAPTION_GAP = 44 // 二维码瓦片底部到说明行的距离
const TITLE_GAP = 48 // 标题区与二维码区的最小水平间距
const TITLE_MAX_WIDTH = W - MARGIN * 2 - QR_TILE - TITLE_GAP
const TITLE_BOTTOM = H - MARGIN - QR_CAPTION_GAP

const FONT_STACK =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", ui-sans-serif, system-ui, sans-serif'

// 品牌点色与 /api/og 卡的圆点一致
const ACCENT = "#e9b949"

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // 跨域必需：否则 canvas 被污染，导出会抛 SecurityError
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image load failed: ${src}`))
    img.src = src
  })
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

function drawScrim(ctx: CanvasRenderingContext2D) {
  const top = H * 0.55
  const scrim = ctx.createLinearGradient(0, top, 0, H)
  scrim.addColorStop(0, "rgba(0,0,0,0)")
  scrim.addColorStop(1, "rgba(0,0,0,0.72)")
  ctx.fillStyle = scrim
  ctx.fillRect(0, top, W, H - top)
}

function drawMark(ctx: CanvasRenderingContext2D, siteName: string) {
  const cy = MARGIN + 18
  ctx.beginPath()
  ctx.arc(MARGIN + 10, cy - 6, 10, 0, Math.PI * 2)
  ctx.fillStyle = ACCENT
  ctx.fill()
  ctx.font = `600 36px ${FONT_STACK}`
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(siteName, MARGIN + 34, cy)
}

function drawTitle(ctx: CanvasRenderingContext2D, title: string) {
  const measure = (text: string, fontSize: number) => {
    ctx.font = `700 ${fontSize}px ${FONT_STACK}`
    return ctx.measureText(text).width
  }
  const { fontSize, lines } = layoutTitle(measure, title, TITLE_MAX_WIDTH)
  if (lines.length === 0) return
  const lineHeight = Math.round(fontSize * 1.3)
  const blockHeight = (lines.length - 1) * lineHeight + fontSize
  ctx.font = `700 ${fontSize}px ${FONT_STACK}`
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = "#ffffff"
  ctx.shadowColor = "rgba(0,0,0,0.45)"
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 4
  let y = TITLE_BOTTOM - (blockHeight - fontSize) // 首行基线
  for (const line of lines) {
    ctx.fillText(line, MARGIN, y)
    y += lineHeight
  }
  ctx.shadowColor = "transparent"
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

function drawQrTile(
  ctx: CanvasRenderingContext2D,
  qrCanvas: HTMLCanvasElement | null,
  url: string,
  date: string
) {
  const x = W - MARGIN - QR_TILE
  const y = H - MARGIN - QR_CAPTION_GAP - QR_TILE
  if (qrCanvas) {
    ctx.beginPath()
    ctx.roundRect(x, y, QR_TILE, QR_TILE, QR_RADIUS)
    ctx.fillStyle = "#ffffff"
    ctx.fill()
    ctx.drawImage(qrCanvas, x + QR_PAD, y + QR_PAD, QR_CONTENT, QR_CONTENT)
  }
  // 说明行（域名 · 日期）：QR 即使缺失也保留，卡片仍指向来源
  const host = safeHost(url)
  ctx.font = `500 26px ${FONT_STACK}`
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.textAlign = "right"
  ctx.textBaseline = "alphabetic"
  ctx.fillText(host ? `${host} · ${date}` : date, W - MARGIN, H - MARGIN)
  ctx.textAlign = "left"
}

/** 生成二维码离屏画布；库加载失败返回 null（卡片隐藏 QR 区继续渲染）。 */
async function renderQr(
  url: string,
  size: number
): Promise<HTMLCanvasElement | null> {
  try {
    const mod = await import("qrcode-generator")
    const make = (mod.default ?? mod) as unknown as (
      typeNumber: number,
      level: string
    ) => {
      addData(data: string): void
      make(): void
      getModuleCount(): number
      isDark(row: number, col: number): boolean
    }
    const qr = make(0, "M") // typeNumber 0 = 自动选版本
    qr.addData(url)
    qr.make()
    const count = qr.getModuleCount()
    const scale = size / (count + 8) // 四边各 4 模块 quiet zone
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = "#000000"
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (!qr.isDark(row, col)) continue
        ctx.fillRect(
          (col + 4) * scale,
          (row + 4) * scale,
          Math.ceil(scale),
          Math.ceil(scale)
        )
      }
    }
    return canvas
  } catch {
    return null
  }
}

interface ShareCardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string
  title: string
  date: string
  slug: string
  siteName: string
}

export function ShareCardDialog({
  open,
  onOpenChange,
  url,
  title,
  date,
  slug,
  siteName,
}: ShareCardDialogProps) {
  const { t } = useT()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [bgIndex, setBgIndex] = useState(() => pickBackground(slug))
  const rerollCount = useRef(0)
  const [qr, setQr] = useState<HTMLCanvasElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [canCopy, setCanCopy] = useState(false)
  const [canShare, setCanShare] = useState(false)

  // 能力探测只在客户端跑：不支持的浏览器直接不渲染对应按钮
  useEffect(() => {
    setCanCopy(
      typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write
    )
    try {
      const probe = new File([new Uint8Array(1)], "probe.png", {
        type: "image/png",
      })
      setCanShare(!!navigator.canShare?.({ files: [probe] }))
    } catch {
      setCanShare(false)
    }
  }, [])

  // 二维码只随 url 生成一次（换图不影响二维码）
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void renderQr(url, QR_CONTENT).then((canvas) => {
      if (!cancelled) setQr(canvas)
    })
    return () => {
      cancelled = true
    }
  }, [open, url])

  const drawToken = useRef(0)

  const drawCard = useCallback(
    async (index: number, qrCanvas: HTMLCanvasElement | null) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const token = ++drawToken.current
      setBusy(true)

      // 品牌色兜底渐变先铺底：底图加载中/失败都不出现空白画布
      const bg = ctx.createLinearGradient(0, 0, W, H)
      bg.addColorStop(0, "#1c2333")
      bg.addColorStop(0.55, "#2b3a67")
      bg.addColorStop(1, "#131822")
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      try {
        const img = await loadImage(SHARE_BG_POOL[index])
        if (token !== drawToken.current) return // 已被更新的绘制取代
        drawCover(ctx, img)
      } catch {
        // 底图失败：保留兜底渐变
      }
      if (token !== drawToken.current) return

      drawScrim(ctx)
      drawMark(ctx, siteName)
      drawTitle(ctx, title)
      drawQrTile(ctx, qrCanvas, url, date)
      setBusy(false)
    },
    [siteName, title, url, date]
  )

  useEffect(() => {
    if (!open) return
    void drawCard(bgIndex, qr)
  }, [open, bgIndex, qr, drawCard])

  function handleReroll() {
    rerollCount.current += 1
    setBgIndex((current) =>
      pickBackground(`${slug}#${rerollCount.current}`, current)
    )
  }

  function exportBlob(type: string, quality?: number): Promise<Blob | null> {
    const canvas = canvasRef.current
    if (!canvas) return Promise.resolve(null)
    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), type, quality)
    )
  }

  async function handleDownload() {
    const blob = await exportBlob("image/jpeg", 0.92)
    if (!blob) {
      toast.error(t("post.cardExportFailed"))
      return
    }
    const href = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = href
    a.download = shareCardFilename(slug)
    a.click()
    // 立刻 revoke 可能取消下载，延后一拍
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  async function handleCopy() {
    try {
      const blob = await exportBlob("image/png")
      if (!blob) throw new Error("toBlob returned null")
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ])
      toast.success(t("post.cardCopied"))
    } catch {
      toast.error(t("post.copyFailed"))
    }
  }

  async function handleShare() {
    try {
      const blob = await exportBlob("image/jpeg", 0.92)
      if (!blob) throw new Error("toBlob returned null")
      const file = new File([blob], shareCardFilename(slug), {
        type: "image/jpeg",
      })
      if (!navigator.canShare?.({ files: [file] })) return
      await navigator.share({ files: [file], title })
    } catch (err) {
      // 用户取消系统分享（AbortError）静默；其余给出可重试提示
      if ((err as Error)?.name !== "AbortError") {
        toast.error(t("post.cardExportFailed"))
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(24rem,100%)]">
        <DialogHeader>
          <DialogTitle>{t("post.shareCard")}</DialogTitle>
        </DialogHeader>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          role="img"
          aria-label={t("post.shareCard")}
          className="w-full rounded-lg ring-1 ring-foreground/10"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReroll}
            disabled={busy}
          >
            <RefreshCw size={14} />
            {t("post.cardReroll")}
          </Button>
          <Button size="sm" onClick={handleDownload}>
            <Download size={14} />
            {t("post.cardDownload")}
          </Button>
          {canCopy && (
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy size={14} />
              {t("post.cardCopy")}
            </Button>
          )}
          {canShare && (
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 size={14} />
              {t("post.cardShare")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd /Users/zephyr/Code/zlog && pnpm --filter @zlog/web typecheck && pnpm --filter @zlog/web lint`
Expected: exit 0. If `ctx.roundRect` is missing from the TS DOM lib, replace that block with a manual rounded-rect path (`arcTo` × 4) — do not add a dependency.

- [ ] **Step 3: Commit**

```bash
cd /Users/zephyr/Code/zlog
git add apps/web/src/components/blog/share-card-dialog.tsx
git commit -m "feat: 分享卡对话框（canvas 渲染管线 + 下载/复制/系统分享）"
```

---

### Task 4: Wire the button into post pages

**Files:**
- Modify: `apps/web/src/lib/i18n/post.ts`
- Modify: `apps/web/src/components/blog/share-buttons.tsx`
- Modify: `apps/web/src/app/posts/[slug]/page.tsx`

- [ ] **Step 1: Add i18n keys (zh + en — the checker enforces symmetry)**

In `apps/web/src/lib/i18n/post.ts`, after `copyFailed: "复制失败",` (zh block) add:

```ts
shareCard: "生成分享卡",
cardReroll: "换一张",
cardDownload: "下载图片",
cardCopy: "复制图片",
cardCopied: "图片已复制！",
cardShare: "分享…",
cardExportFailed: "生成图片失败，请重试",
```

After `copyFailed: "Copy failed",` (en block) add:

```ts
shareCard: "Share card",
cardReroll: "Shuffle",
cardDownload: "Download image",
cardCopy: "Copy image",
cardCopied: "Image copied!",
cardShare: "Share…",
cardExportFailed: "Failed to generate image, please retry",
```

- [ ] **Step 2: Add `ShareCardButton` to `share-buttons.tsx`**

Replace the file with (CopyLinkButton unchanged; new imports + new component):

```tsx
"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Link, Share2 } from "lucide-react"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { IconButton } from "@/components/ui/icon-button"
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard"

// 对话框（含 canvas 管线）点击才加载，不进文章页首包
const ShareCardDialog = dynamic(
  () => import("./share-card-dialog").then((m) => m.ShareCardDialog),
  { ssr: false }
)

export function CopyLinkButton({ url }: { url: string }) {
  const { t } = useT()
  const { copy } = useCopyToClipboard()

  async function handleCopy() {
    const ok = await copy(window.location.origin + url)
    if (ok) {
      toast.success(t("post.linkCopied"))
    } else {
      toast.error(t("post.copyFailed"))
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <IconButton
            size="sm"
            bordered
            aria-label={t("post.copyLink")}
            onClick={handleCopy}
          >
            <Link size={14} />
          </IconButton>
        }
      />
      <TooltipContent>{t("post.copyLink")}</TooltipContent>
    </Tooltip>
  )
}

export function ShareCardButton({
  url,
  slug,
  title,
  date,
  siteName,
}: {
  /** 规范绝对地址（用于二维码，桌面壳内 window.location.origin 不可扫） */
  url: string
  slug: string
  title: string
  date: string
  siteName: string
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <IconButton
              size="sm"
              bordered
              aria-label={t("post.shareCard")}
              onClick={() => setOpen(true)}
            >
              <Share2 size={14} />
            </IconButton>
          }
        />
        <TooltipContent>{t("post.shareCard")}</TooltipContent>
      </Tooltip>
      {open && (
        <ShareCardDialog
          open
          onOpenChange={(next) => setOpen(next)}
          url={url}
          slug={slug}
          title={title}
          date={date}
          siteName={siteName}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: Render it in both share rows of the post page**

In `apps/web/src/app/posts/[slug]/page.tsx`:

1. Line 12 — extend the import:
   `import { CopyLinkButton, ShareCardButton } from "@/components/blog/share-buttons"`
2. After `if (!post || post.draft) notFound()` (line 93) add:

```tsx
  // 分享卡二维码用规范地址：桌面壳/本地预览下扫出来也指向线上文章
  const shareUrl = `${site.siteUrl}/posts/${encodeURIComponent(post.slug)}`
```

3. Top share row (around line 202) becomes:

```tsx
              {/* Share */}
              <div className="ml-auto flex items-center gap-1">
                <ShareCardButton
                  url={shareUrl}
                  slug={post.slug}
                  title={post.title}
                  date={post.date}
                  siteName={site.name}
                />
                <CopyLinkButton url={`/posts/${encodeURIComponent(post.slug)}`} />
              </div>
```

4. Footer share row (around line 282) becomes:

```tsx
              <div className="flex items-center gap-2 sm:pt-6">
                <ShareCardButton
                  url={shareUrl}
                  slug={post.slug}
                  title={post.title}
                  date={post.date}
                  siteName={site.name}
                />
                <CopyLinkButton
                  url={`/posts/${encodeURIComponent(post.slug)}`}
                />
              </div>
```

- [ ] **Step 4: Gates**

Run: `cd /Users/zephyr/Code/zlog && pnpm --filter @zlog/web check:i18n && pnpm --filter @zlog/web typecheck && pnpm --filter @zlog/web lint`
Expected: i18n symmetric (`post.ts: N keys, symmetric`), typecheck + lint exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/zephyr/Code/zlog
git add apps/web/src/lib/i18n/post.ts apps/web/src/components/blog/share-buttons.tsx apps/web/src/app/posts/[slug]/page.tsx
git commit -m "feat: 文章页接入分享卡按钮（顶部/底部两处）+ 文案"
```

---

### Task 5: End-to-end verification (live canvas + export build)

**Files:**
- Create: `$CLAUDE_JOB_DIR/tmp/verify-share-card.mjs` (scratch, not committed)

- [ ] **Step 1: Full test suite + typecheck + lint**

Run: `cd /Users/zephyr/Code/zlog && pnpm --filter @zlog/web test && pnpm --filter @zlog/web typecheck && pnpm --filter @zlog/web lint`
Expected: all green (227+ existing web tests plus the 10 new ones).

- [ ] **Step 2: Start dev server against a scratch DB and pre-warm**

```bash
cd /Users/zephyr/Code/zlog/apps/web
TURSO_DATABASE_URL=file:/Users/zephyr/.claude/jobs/9f6d5bbc/tmp/export-e2e.db pnpm exec next dev -p 4399 > /Users/zephyr/.claude/jobs/9f6d5bbc/tmp/share-card-dev.log 2>&1 &
# 预热编译（Turbopack 首次编译可达 40s+）
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4399/posts/hello
```
Expected: `200` (retry the curl every ~10s until it is; the scratch DB has a published `hello` post).

- [ ] **Step 3: Launch headless Chrome once**

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless=new --remote-debugging-port=9333 \
  --user-data-dir=/Users/zephyr/.claude/jobs/9f6d5bbc/tmp/chrome-share \
  about:blank > /Users/zephyr/.claude/jobs/9f6d5bbc/tmp/chrome-share.log 2>&1 &
```
Expected: `curl -s http://127.0.0.1:9333/json/version` returns JSON.

- [ ] **Step 4: Run the CDP verification script**

Create `/Users/zephyr/.claude/jobs/9f6d5bbc/tmp/verify-share-card.mjs`:

```js
// 分享卡端到端验证：真实点击 → canvas 像素检查 → 下载落盘 → 导出卡片图。
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs"

const TMP = "/Users/zephyr/.claude/jobs/9f6d5bbc/tmp"
const BASE = "http://localhost:4399"
const DOWNLOADS = `${TMP}/downloads`
mkdirSync(DOWNLOADS, { recursive: true })

async function cdpBase() {
  for (const host of ["[::1]", "127.0.0.1"]) {
    try {
      const r = await fetch(`http://${host}:9333/json/version`, {
        signal: AbortSignal.timeout(1500),
      })
      if (r.ok) return `http://${host}:9333`
    } catch {}
  }
  throw new Error("no CDP endpoint on 9333")
}
const CDP = await cdpBase()

const res = await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })
const target = await res.json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad })

let id = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
const evaluate = async (expression) => {
  const { result } = await send("Runtime.evaluate", { expression, returnByValue: true })
  return result.value
}
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))

await send("Page.enable")
await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280, height: 1000, deviceScaleFactor: 2, mobile: false,
})
await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOADS })

await send("Page.navigate", { url: `${BASE}/posts/hello` })
await sleep(9000)

// 1) 点开分享卡
const clicked = await evaluate(`(() => {
  const btn = document.querySelector('button[aria-label="生成分享卡"]')
  if (!btn) return "no-button"
  btn.click()
  return "clicked"
})()`)
console.log("click:", clicked)
await sleep(6000) // 等底图（网络）+ 二维码渲染

// 2) canvas 像素检查：整体有方差（非空白）、QR 区有深色模块
const probe = await evaluate(`(() => {
  const c = document.querySelector('[role="dialog"] canvas')
  if (!c) return { error: "no canvas" }
  const ctx = c.getContext("2d")
  const sample = (x0, y0, w, h) => {
    const { data } = ctx.getImageData(x0, y0, w, h)
    let min = 255, max = 0, dark = 0
    for (let i = 0; i < data.length; i += 4) {
      const v = (data[i] + data[i+1] + data[i+2]) / 3
      if (v < min) min = v
      if (v > max) max = v
      if (v < 128) dark++
    }
    return { min, max, dark }
  }
  return {
    w: c.width, h: c.height,
    whole: sample(0, 0, c.width, c.height),
    qr: sample(768 + 16, 1084 + 16, 200, 200),
  }
})()`)
console.log("canvas:", JSON.stringify(probe))
// 期望：w=1080, h=1440；whole.min<60 且 whole.max>200（照片有明暗）；
//       qr.dark > 500（黑模块存在）

// 3) 导出卡片图供目检（若跨域污染这里会抛错——CORS 的最终验证）
const dataUrl = await evaluate(
  `document.querySelector('[role="dialog"] canvas').toDataURL("image/jpeg", 0.92)`
)
if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/jpeg")) {
  writeFileSync(`${TMP}/share-card.jpg`, Buffer.from(dataUrl.split(",")[1], "base64"))
  console.log("card saved:", `${TMP}/share-card.jpg`)
} else {
  console.log("card export FAILED:", String(dataUrl).slice(0, 120))
}

// 4) 点「下载图片」，确认文件落盘
const dl = await evaluate(`(() => {
  const btn = [...document.querySelectorAll('[role="dialog"] button')]
    .find((b) => b.textContent.includes("下载图片"))
  if (!btn) return "no-download-button"
  btn.click()
  return "download-clicked"
})()`)
console.log("download:", dl)
await sleep(3000)
const files = readdirSync(DOWNLOADS).filter((f) => f.endsWith(".jpg"))
for (const f of files) {
  console.log("file:", f, statSync(`${DOWNLOADS}/${f}`).size, "bytes")
}

// 5) 截图对话框整体
const shot = await send("Page.captureScreenshot", { format: "png" })
writeFileSync(`${TMP}/share-card-dialog.png`, Buffer.from(shot.data, "base64"))

await fetch(`${CDP}/json/close/${target.id}`)
ws.close()
console.log("done")
```

Run: `node /Users/zephyr/.claude/jobs/9f6d5bbc/tmp/verify-share-card.mjs`
Expected: `click: clicked`; `canvas: {"w":1080,"h":1440,...}` with `whole.min<60`, `whole.max>200`, `qr.dark>500`; `card saved`; a `zlog-hello.jpg` file > 50 KB; screenshot written.

- [ ] **Step 5: Eyeball the artifacts**

Read `/Users/zephyr/.claude/jobs/9f6d5bbc/tmp/share-card.jpg` and `share-card-dialog.png` (Read tool renders images). Confirm: photo fills the frame, scrim darkens the bottom, gold dot + site name top-left, title readable and above the QR, QR + `域名 · 日期` bottom-right, no clipping. If the layout is off, tune the constants in Task 3 (`MARGIN`, `TITLE_BOTTOM`, `TITLE_MAX_WIDTH`) and re-run Step 4.

- [ ] **Step 6: Kill background processes**

```bash
kill %1 %2 2>/dev/null; pkill -f "next dev -p 4399" 2>/dev/null; pkill -f "remote-debugging-port=9333" 2>/dev/null; sleep 1
lsof -ti :4399 -ti :9333 || echo "ports free"
```
Expected: `ports free`.

- [ ] **Step 7: Static export build must stay green**

```bash
cd /Users/zephyr/Code/zlog
TURSO_DATABASE_URL=file:/Users/zephyr/.claude/jobs/9f6d5bbc/tmp/export-e2e.db pnpm --filter @zlog/web export
git status --porcelain
```
Expected: build exits 0, `apps/web/out/` regenerated, `git status` clean afterwards (toggle script self-heals). This is the gate that catches export-only breakage (memory: `zlog-export-build-constraints`).

- [ ] **Step 8: No commit needed** — verification produces no repo changes. If Step 5 required tuning, commit it:

```bash
cd /Users/zephyr/Code/zlog
git add apps/web/src/components/blog/share-card-dialog.tsx
git commit -m "fix: 分享卡排版微调（视觉验证后）"
```

---

### Task 6: Push (requires explicit user authorization)

- [ ] **Step 1: Ask the user** — use AskUserQuestion: "分享卡功能已完成并通过本地验证，推送到 main？" Options: 推送 main（推荐）/ 先看效果再定. Do NOT push without this approval.

- [ ] **Step 2: Push and monitor**

```bash
cd /Users/zephyr/Code/zlog && git push origin main
```
Then watch the deploy workflow (`gh run list --branch main --limit 1`) until terminal state; report the conclusion. If it fails, fix forward — never force-push.

---

## Self-review notes

- Spec coverage: pool + stable seed + reroll (Task 1/3), 1080×1440 composition + scrim + mark + title ladder + QR tile + caption (Task 3), download/copy/share with capability gating (Task 3), canonical URL prop (Task 4), background-fail gradient + QR-fail omit + toBlob-null toast (Task 3), unit + CDP + export-build testing (Task 1/5), i18n + file touch list (Task 4).
- Type consistency: `pickBackground(seed, excludeIndex?)`, `layoutTitle(measure, text, maxWidth, maxLines?)` → `{ fontSize, lines }`, `SHARE_BG_POOL: readonly string[]`, `shareCardFilename(slug)` — used identically in tests, lib, and dialog.
- Known trade-off: reroll is deterministic per (slug, reroll-count) rather than `Math.random()` — keeps every draw reproducible and testable; each press still lands somewhere new because the seed changes and `excludeIndex` guards the current image.
