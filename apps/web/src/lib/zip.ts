import { deflateRawSync } from "node:zlib"

/** 极简 ZIP 写入器：单盘、无 ZIP64、无 data descriptor——够用即可。
 *  条目内容全部走 deflate，文件名标 UTF-8（GP bit 11），大小全部
 *  预先已知写进头部（因此不需要 descriptor）。 */
export type ZipEntry = { path: string; text: string }

// CRC-32（IEEE，反射多项式 0xEDB88320）——ZIP 校验和。
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff])
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ])
}

function concat(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/** MS-DOS 时间戳。ZIP 本身无时区语义，统一取 UTC 分量，保证
 *  同一 `mtime` 输入产出同一字节（测试可断言确定性）。 */
function dosDateTime(at: Date): { time: number; date: number } {
  const time =
    (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1)
  const date =
    ((at.getUTCFullYear() - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate()
  return { time, date }
}

const MAX32 = 0xffffffff

// 返回具体 Uint8Array<ArrayBuffer>：TS 5.7 起 BodyInit 只收
// ArrayBuffer 支撑的视图，NextResponse 直接吃这个缓冲区。
export function buildZip(entries: ZipEntry[], mtime: Date): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const { time, date } = dosDateTime(mtime)
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.path)
    const raw = encoder.encode(entry.text)
    const compressed = deflateRawSync(raw)
    if (name.length > 0xffff || raw.length > MAX32 || compressed.length > MAX32) {
      throw new Error(`zip entry too large: ${entry.path}`)
    }
    const crc = crc32(raw)

    // 本地文件头 + 名称 + 压缩数据
    const local = concat([
      u32(0x04034b50), // 签名
      u16(20), // 解压所需版本 (2.0)
      u16(0x0800), // 通用位标记：文件名 UTF-8
      u16(8), // 压缩方法：deflate
      u16(time),
      u16(date),
      u32(crc),
      u32(compressed.length),
      u32(raw.length),
      u16(name.length),
      u16(0), // extra 长度
      name,
      compressed,
    ])
    chunks.push(local)

    // 中央目录项（与本地头字段对应，另存本地头偏移）
    central.push(
      concat([
        u32(0x02014b50),
        u16(20), // 创建版本
        u16(20), // 解压所需版本
        u16(0x0800),
        u16(8),
        u16(time),
        u16(date),
        u32(crc),
        u32(compressed.length),
        u32(raw.length),
        u16(name.length),
        u16(0), // extra
        u16(0), // comment
        u16(0), // 起始磁盘
        u16(0), // 内部属性
        u32(0), // 外部属性
        u32(offset),
        name,
      ])
    )
    offset += local.length
  }

  const centralStart = offset
  const centralBytes = concat(central)
  chunks.push(centralBytes)
  // 中央目录结束记录
  chunks.push(
    concat([
      u32(0x06054b50),
      u16(0), // 本磁盘号
      u16(0), // 中央目录所在磁盘
      u16(entries.length),
      u16(entries.length),
      u32(centralBytes.length),
      u32(centralStart),
      u16(0), // comment 长度
    ])
  )
  return concat(chunks)
}
