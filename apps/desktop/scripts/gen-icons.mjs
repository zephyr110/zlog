import { deflateSync, inflateSync } from "node:zlib"
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { applySquircleMask, composeMacAppIcon } from "./mac-icon-mask.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")

// ── 真实 logo 优先 ──────────────────────────────────────────────────────
// 默认站点标志（web 包 public/，1024×1024 PNG）：应用图标写入
// build/icon.png（主体缩进 + squircle，electron-builder 再生成 icns/ico）；
// 托盘仍用未裁切的方图。源文件缺失时退回下方占位生成器。
const LOGO_SOURCE = join(root, "..", "..", "apps", "web", "public", "zlog-logo.png")
const TRAY_MARK_SOURCE = join(root, "assets", "tray-mark.png")
const ICON_TARGET = join(root, "build", "icon.png")
const TRAY_TARGET = join(root, "assets", "tray.png")
// 菜单栏模板图标（macOS）：18pt @1x 与 @2x（用户反馈 16pt 偏小，且原图
// 四周留白等比缩到 16pt 后图形极小——见 boxDownsampleTemplate 的裁剪放大）；
// 文件名以 Template 结尾；1x + @2x 由 tray.ts 编进同一张 NativeImage。
const TRAY_TEMPLATES = [
  { size: 18, file: "trayTemplate.png" },
  { size: 36, file: "trayTemplate@2x.png" },
]

if (existsSync(LOGO_SOURCE)) {
  mkdirSync(join(root, "assets"), { recursive: true })
  mkdirSync(join(root, "build"), { recursive: true })
  writeMaskedAppIcon(LOGO_SOURCE, ICON_TARGET)
  copyFileSync(LOGO_SOURCE, TRAY_TARGET)
  const trayMark = existsSync(TRAY_MARK_SOURCE) ? TRAY_MARK_SOURCE : LOGO_SOURCE
  if (trayMark === LOGO_SOURCE) {
    console.warn("tray-mark.png not found — deriving menu-bar template from colorful logo")
  }
  deriveTrayTemplates(trayMark)
  console.log("icons copied from", LOGO_SOURCE)
} else {
  console.warn(`zlog-logo.png not found at ${LOGO_SOURCE} — generating placeholder icons`)
  generatePlaceholderIcons()
}

const icnsCache = join(root, "release", ".icon-icns")
if (existsSync(icnsCache)) {
  rmSync(icnsCache, { recursive: true, force: true })
  console.log("cleared electron-builder icon cache", icnsCache)
}

/** 应用图标：主体缩进板内再套 squircle（托盘仍用未裁切的方图）。 */
function writeMaskedAppIcon(sourcePath, destPath) {
  const src = decodePng(readFileSync(sourcePath))
  if (src.width !== src.height) {
    throw new Error(`app icon must be square (got ${src.width}×${src.height})`)
  }
  writeFileSync(destPath, pngFromRgba(src.width, composeMacAppIcon(src.data, src.width)))
}

// ── 菜单栏模板图标派生（macOS） ──────────────────────────────────────
// 菜单栏图标必须是"模板图"：黑色图形 + alpha 透明通道，系统自动按
// 浅色/深色菜单栏渲染黑/白（HIG）。源图应是深底白标（tray-mark.png）；
// 按亮度阈值提取图形为黑色 + 透明背景。彩色 logo 亮度不够，抽出来会发淡。
function deriveTrayTemplates(sourcePath) {
  let src
  try {
    src = decodePng(readFileSync(sourcePath))
  } catch (err) {
    console.warn(`tray template derivation failed (${err.message}) — macOS will fall back to the colored icon`)
    return
  }
  for (const { size, file } of TRAY_TEMPLATES) {
    writeFileSync(join(root, "assets", file), pngFromRgba(size, boxDownsampleTemplate(src, size)))
  }
  console.log("generated assets/trayTemplate.png + trayTemplate@2x.png")
}

/** 解码 8-bit RGB/RGBA PNG（IHDR + IDAT + unfilter，零依赖）。 */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG")
  let pos = 8
  let width = 0, height = 0, colorType = 0, bitDepth = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString("ascii", pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]
    } else if (type === "IDAT") {
      idat.push(data)
    } else if (type === "IEND") break
    pos += 12 + len
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG (bitDepth=${bitDepth} colorType=${colorType})`)
  }
  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  const raw = inflateSync(Buffer.concat(idat))
  const out = Buffer.alloc(width * height * 4)
  const prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev[x]
      const c = x >= bpp ? prev[x - bpp] : 0
      let v = line[x]
      switch (filter) {
        case 1: v += a; break
        case 2: v += b; break
        case 3: v += (a + b) >> 1; break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
      }
      cur[x] = v & 0xff
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      out[o] = cur[x * bpp]
      out[o + 1] = cur[x * bpp + 1]
      out[o + 2] = cur[x * bpp + 2]
      out[o + 3] = colorType === 6 ? cur[x * bpp + 3] : 255
    }
    prev.set(cur)
  }
  return { width, height, data: out }
}

/** 亮度 → 模板 alpha：亮部（图形）变黑色不透明，暗部（底色）变透明；
 *  阈值附近的像素线性过渡，保留抗锯齿边缘。 */
function toTemplateAlpha(src) {
  const { width, height, data } = src
  const out = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    const lum = (data[o] + data[o + 1] + data[o + 2]) / 3
    // 系数 2.55：图形中心像素 alpha 达 255（2 会停在 244，菜单栏里约 4% 半透明）
    const alpha = Math.max(0, Math.min(255, Math.round((lum - 128) * 2.55)))
    out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = alpha
  }
  return out
}

/** 菜单栏模板图标：裁剪图形包围盒 → 放大填充画布（四周各留 2px）。
 *  原图是 1024 方块、图形居中且四周留白大，若直接降采样到 18px，
 *  图形在菜单栏里会小到看不清；裁剪后图形占满画布，视觉权重正常。 */
function boxDownsampleTemplate(src, size) {
  const alpha = toTemplateAlpha(src)
  const { width, height } = src
  const PAD = 2
  // 图形包围盒（alpha 覆盖度 > 32 的像素）
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[(y * width + x) * 4 + 3] > 32) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return Buffer.alloc(size * size * 4) // 全透明兜底
  const bw = maxX - minX + 1, bh = maxY - minY + 1
  // 目标尺寸（画布减两侧留白），等比缩放
  const target = size - PAD * 2
  const scale = Math.min(target / bw, target / bh)
  const sw = Math.max(1, Math.round(bw * scale))
  const sh = Math.max(1, Math.round(bh * scale))
  const offX = Math.floor((size - sw) / 2)
  const offY = Math.floor((size - sh) / 2)
  const out = Buffer.alloc(size * size * 4)
  // 面积平均：每个输出像素对源覆盖区域求 alpha 均值（最近邻会锯齿）
  for (let y = 0; y < sh; y++) {
    const sy0 = Math.floor(y / scale)
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) / scale))
    for (let x = 0; x < sw; x++) {
      const sx0 = Math.floor(x / scale)
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) / scale))
      let sum = 0
      let n = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          sum += alpha[((minY + sy) * width + (minX + sx)) * 4 + 3]
          n++
        }
      }
      out[((offY + y) * size + offX + x) * 4 + 3] = Math.round(sum / n)
    }
  }
  return out
}

/** 由 RGBA 缓冲编码 PNG（filter 0）。 */
// var：顶部复制分支在模块求值早期就会调用本链（TDZ 下 let 不可用）
var crcTable = null
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c
    }
  }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, "ascii")
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function pngFromRgba(size, rgba) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(size * stride)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

/** 占位图标生成器：纯色深灰方块（真实 logo 缺失时的兜底）。 */
function generatePlaceholderIcons() {
  /** 纯色 RGBA PNG（8-bit，filter none）。 */
  function png(size, rgba) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(size * stride)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < size; x++) {
      const o = y * stride + 1 + x * 4
      raw[o] = rgba[0]
      raw[o + 1] = rgba[1]
      raw[o + 2] = rgba[2]
      raw[o + 3] = rgba[3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

  // 占位图标：深灰方块（真实 logo 缺失时的兜底）。应用图标同样套 squircle。
  const COLOR = [38, 38, 38, 255]
  mkdirSync(join(root, "assets"), { recursive: true })
  mkdirSync(join(root, "build"), { recursive: true })
  writeFileSync(join(root, "assets/tray.png"), png(32, COLOR))
  const size = 512
  const rgba = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = COLOR[0]
    rgba[i * 4 + 1] = COLOR[1]
    rgba[i * 4 + 2] = COLOR[2]
    rgba[i * 4 + 3] = COLOR[3]
  }
  writeFileSync(join(root, "build/icon.png"), pngFromRgba(size, applySquircleMask(rgba, size)))
  console.log("generated assets/tray.png + build/icon.png")
}
