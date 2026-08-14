import { deflateSync } from "node:zlib"
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")

// ── 真实 logo 优先 ──────────────────────────────────────────────────────
// 默认站点标志（web 包 public/，1024×1024 PNG）：同时作为桌面应用图标
// （electron-builder 从 build/icon.png 生成 icns/ico）与托盘图标
// （tray.ts 运行时 resize 到 16×16）。源文件缺失时退回下方占位生成器。
const LOGO_SOURCE = join(root, "..", "..", "apps", "web", "public", "zlog-logo.png")
const ICON_TARGET = join(root, "build", "icon.png")
const TRAY_TARGET = join(root, "assets", "tray.png")

if (existsSync(LOGO_SOURCE)) {
  mkdirSync(join(root, "assets"), { recursive: true })
  mkdirSync(join(root, "build"), { recursive: true })
  copyFileSync(LOGO_SOURCE, ICON_TARGET)
  copyFileSync(LOGO_SOURCE, TRAY_TARGET)
  console.log("icons copied from", LOGO_SOURCE)
} else {
  console.warn(`zlog-logo.png not found at ${LOGO_SOURCE} — generating placeholder icons`)
  generatePlaceholderIcons()
}

/** 占位图标生成器：纯色深灰方块（零依赖 PNG 编码）。 */
function generatePlaceholderIcons() {
  let crcTable = null
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

  // 占位图标：深灰方块（真实 logo 缺失时的兜底）。
  const COLOR = [38, 38, 38, 255]
  mkdirSync(join(root, "assets"), { recursive: true })
  mkdirSync(join(root, "build"), { recursive: true })
  writeFileSync(join(root, "assets/tray.png"), png(32, COLOR))
  writeFileSync(join(root, "build/icon.png"), png(512, COLOR))
  console.log("generated assets/tray.png + build/icon.png")
}
