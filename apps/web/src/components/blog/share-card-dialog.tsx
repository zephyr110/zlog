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

// 卡片排版常量（画布坐标，1080×1440）。
// 页脚两行：第一行标题（贴左，整宽）；第二行二维码贴左（与标题同左缘），
// 「日期（上）/ 域名（下）」紧贴二维码右侧、左对齐，并垂直居中于二维码
// ——标题与二维码共享一条左版心线，页脚收成一个信息组。
// 白边尽量小：quiet zone 2 模块 + 8px 瓦片内边距。
const MARGIN = 80
const QR_CONTENT = 200 // 内容区（含 2 模块 quiet zone）
const QR_PAD = 8
const QR_TILE = QR_CONTENT + QR_PAD * 2
const QR_RADIUS = 20
const TITLE_GAP = 40 // 标题块与二维码行之间的垂直间距
const CAPTION_SIZE = 28 // 页脚文字字号
const CAPTION_LINE_GAP = 40 // 日期与域名两行间距
const CAPTION_QR_GAP = 40 // 二维码与文字块的横向间隙
const TITLE_MAX_WIDTH = W - MARGIN * 2
const TITLE_BOTTOM = H - MARGIN - QR_TILE - TITLE_GAP

const FONT_STACK =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", ui-sans-serif, system-ui, sans-serif'

// 叠卡：底卡顺时针旋转角（度），第二张取两倍形成扇形叠放。基准角写成
// transform（而非 Tailwind 的 rotate-* —— v4 会编译成独立的 rotate
// 属性），动画关键帧用同一常量，否则 transform 动画会叠在 rotate 属性
// 上，起止瞬间跳变。
const STACK_ANGLE = 2.5

type QrcodeFactory = (typeNumber: number, level: string) => {
  addData(data: string): void
  make(): void
  getModuleCount(): number
  isDark(row: number, col: number): boolean
}

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
  // 页脚第二行：二维码贴左边距（与标题同左缘）；「日期（上）/ 域名（下）」
  // 两行文字紧贴二维码右侧、共享左缘，并垂直居中于二维码——标题与二维码
  // 连成一条左版心线，页脚收成一个信息组。
  // QR 即使缺失也保留文字，卡片仍指向来源。
  const host = safeHost(url)
  const y = H - MARGIN - QR_TILE
  if (qrCanvas) {
    ctx.beginPath()
    ctx.roundRect(MARGIN, y, QR_TILE, QR_TILE, QR_RADIUS)
    ctx.fillStyle = "#ffffff"
    ctx.fill()
    ctx.drawImage(qrCanvas, MARGIN + QR_PAD, y + QR_PAD, QR_CONTENT, QR_CONTENT)
  }
  ctx.font = `500 ${CAPTION_SIZE}px ${FONT_STACK}`
  const textX = MARGIN + QR_TILE + CAPTION_QR_GAP
  const midY = y + QR_TILE / 2 // 二维码中线：两行文字对称跨骑
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(date, textX, midY - CAPTION_LINE_GAP / 2)
  if (host) ctx.fillText(host, textX, midY + CAPTION_LINE_GAP / 2)
  ctx.textBaseline = "alphabetic"
}

/** 生成二维码离屏画布；库加载失败返回 null（卡片隐藏 QR 区继续渲染）。 */
async function renderQr(
  url: string,
  size: number
): Promise<HTMLCanvasElement | null> {
  try {
    // 包的 d.ts 是 UMD `export =`：运行时 default（.mjs）与命名空间两种形态都兜住
    const mod: unknown = await import("qrcode-generator")
    const make = ((mod as { default?: unknown }).default ??
      mod) as QrcodeFactory
    const qr = make(0, "M") // typeNumber 0 = 自动选版本
    qr.addData(url)
    qr.make()
    const count = qr.getModuleCount()
    // 四边各 2 模块 quiet zone（低于规范的 4，靠瓦片白底补足对比，
    // 让白边尽量小；模块本身也更大更清晰）
    const scale = size / (count + 4)
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
          (col + 2) * scale,
          (row + 2) * scale,
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
  /** 规范绝对地址（二维码内容） */
  url: string
  title: string
  date: string
  slug: string
}

export function ShareCardDialog({
  open,
  onOpenChange,
  url,
  title,
  date,
  slug,
}: ShareCardDialogProps) {
  const { t } = useT()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const backRef = useRef<HTMLDivElement | null>(null)
  const back2Ref = useRef<HTMLDivElement | null>(null)
  const [bgIndex, setBgIndex] = useState(() => pickBackground(slug))
  const rerollCount = useRef(0)
  const [qr, setQr] = useState<HTMLCanvasElement | null>(null)
  const [busy, setBusy] = useState(false)
  // 能力探测：组件 ssr:false、点击后才挂载，初始化函数只跑一次即够；
  // 不支持的浏览器直接不渲染对应按钮
  const [canCopy] = useState(
    () => typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write
  )
  const [canShare] = useState(() => {
    try {
      const probe = new File([new Uint8Array(1)], "probe.png", {
        type: "image/png",
      })
      return !!navigator.canShare?.({ files: [probe] })
    } catch {
      return false
    }
  })

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
      drawTitle(ctx, title)
      drawQrTile(ctx, qrCanvas, url, date)
      setBusy(false)
    },
    [title, url, date]
  )

  useEffect(() => {
    if (!open) return
    void drawCard(bgIndex, qr)
  }, [open, bgIndex, qr, drawCard])

  /** 换一张的洗牌动效：顶卡反向轻甩回弹，底卡顺势多转一点再归位，
      像从一叠照片里抽换最上面那张（两层底卡摆幅相同、基准角不同）。
      reduced-motion 下不动；连点时先取消上一轮，避免动画叠加打架。 */
  function playShuffle() {
    const top = canvasRef.current
    const back = backRef.current
    const back2 = back2Ref.current
    if (!top || !back || !back2) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    for (const el of [top, back, back2]) {
      el.getAnimations().forEach((animation) => animation.cancel())
    }
    const spring = "cubic-bezier(0.34, 1.4, 0.64, 1)"
    const options = { duration: 620, easing: spring }
    top.animate(
      [
        { transform: "rotate(0deg) scale(1)" },
        { transform: "rotate(-2.4deg) scale(0.985)", offset: 0.38 },
        { transform: "rotate(0.7deg) scale(1.004)", offset: 0.74 },
        { transform: "rotate(0deg) scale(1)" },
      ],
      options
    )
    const swing = (el: HTMLDivElement, base: number) =>
      el.animate(
        [
          { transform: `rotate(${base}deg)` },
          {
            transform: `rotate(${base + 2.3}deg) translateY(3px)`,
            offset: 0.38,
          },
          { transform: `rotate(${base - 0.3}deg)`, offset: 0.74 },
          { transform: `rotate(${base}deg)` },
        ],
        options
      )
    swing(back, STACK_ANGLE)
    swing(back2, STACK_ANGLE * 2)
  }

  function handleReroll() {
    rerollCount.current += 1
    setBgIndex((current) =>
      pickBackground(`${slug}#${rerollCount.current}`, current)
    )
    playShuffle()
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
      <DialogContent className="max-w-[min(40rem,100%)] gap-8 p-5">
        <DialogHeader>
          <DialogTitle>{t("post.shareCard")}</DialogTitle>
        </DialogHeader>
        {/* 叠卡效果：两张灰色底卡顺时针递进微旋（2.5°/5°），从顶卡角上
            露出，像一叠照片。三层同一网格格位叠放，尺寸由 canvas 决定
            （底卡 h-full/w-full 跟随），底卡只是视觉，不参与导出。
            画布要 relative z-10：底卡带 transform（非定位元素会因此进入
            定位层绘制），否则静止时会盖住画布——只有动画期间画布自带
            transform 才反超。
            px-8：5° 底卡的 bbox 比画布宽约 11%，高视口下画布被宽度卡满
            内容区时，扇形角会越出 dialog 边缘（实测 1440×1400 左右各
            10px），容器留出边距才能把整叠框进内容区。
            40rem + gap-8 + p-5：加宽给扇形和四按钮（含英文长标签）留余
            量；底卡角在上下各外扩约 5% 画布宽，两个 gap-8 保证不挤到
            标题与按钮行。画布按比例缩进两个上限（55vh 高 / 容器宽），
            矮视口下自动退让并居中 */}
        <div className="relative mx-auto grid max-w-full place-items-center px-8">
          <div
            ref={back2Ref}
            aria-hidden="true"
            style={{ transform: `rotate(${STACK_ANGLE * 2}deg)` }}
            className="col-start-1 row-start-1 h-full w-full rounded-lg bg-muted ring-1 ring-foreground/5"
          />
          <div
            ref={backRef}
            aria-hidden="true"
            style={{ transform: `rotate(${STACK_ANGLE}deg)` }}
            className="col-start-1 row-start-1 h-full w-full rounded-lg bg-muted ring-1 ring-foreground/5"
          />
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            role="img"
            aria-label={t("post.shareCard")}
            className="relative z-10 col-start-1 row-start-1 block max-h-[55vh] max-w-full rounded-lg ring-1 ring-foreground/10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReroll}
            disabled={busy}
          >
            <RefreshCw
              size={14}
              className={busy ? "animate-spin motion-reduce:animate-none" : undefined}
            />
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
