/**
 * remark-math 只认 `$`/`$$`，而多数模型输出的 Markdown 用 LaTeX 原生的
 * `\(...\)`/`\[...\]`。这里在 MDX 解析前归一化：行内 `\(...\)` → `$...$`；
 * 块级 `\[...\]` → 独立的 `$$` 块。作者常把 `\[` 写在一句话末尾，必须抬到
 * 独立段落，否则 remark-math 只把它当行内公式。围栏代码块与行内代码原样保留。
 */
export function normalizeMathDelimiters(source: string): string {
  let out = ""
  let i = 0
  let inDisplay = false
  // 当前输出行是否只有空白 / 是否已出现过非空白字符（决定 `\[` 前要不要断段）。
  let atLineStart = true
  let lineHasContent = false
  let indent = 0

  const append = (chunk: string) => {
    out += chunk
    for (const ch of chunk) {
      if (ch === "\n") {
        atLineStart = true
        lineHasContent = false
        indent = 0
      } else if (ch === " " || ch === "\t") {
        if (atLineStart) indent += 1
      } else {
        atLineStart = false
        lineHasContent = true
      }
    }
  }

  while (i < source.length) {
    const ch = source[i]

    if (inDisplay) {
      // 公式内容逐字复制，只在未转义的 \] 处收尾。
      if (ch === "\\" && source[i + 1] === "\\") {
        append("\\\\")
        i += 2
        continue
      }
      if (ch === "\\" && source[i + 1] === "]") {
        append(atLineStart ? "$$" : "\n$$")
        append("\n")
        i += 2
        inDisplay = false
        if (source[i] === "\r" && source[i + 1] === "\n") i += 2
        else if (source[i] === "\n") i += 1
        continue
      }
      append(ch)
      i += 1
      continue
    }

    // 围栏代码块：≤3 空格缩进、≥3 个反引号/波浪号；闭合围栏必须同字符且不短于开启。
    if (atLineStart && indent <= 3 && (ch === "`" || ch === "~")) {
      let run = 1
      while (source[i + run] === ch) run += 1
      if (run >= 3) {
        const openLineEnd = source.indexOf("\n", i)
        let lineStart = openLineEnd === -1 ? source.length : openLineEnd + 1
        let fenceEnd = source.length
        while (lineStart < source.length) {
          const nl = source.indexOf("\n", lineStart)
          const line = source
            .slice(lineStart, nl === -1 ? source.length : nl)
            .replace(/\r$/, "")
          const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)
          if (close && close[1][0] === ch && close[1].length >= run) {
            fenceEnd = nl === -1 ? source.length : nl + 1
            break
          }
          if (nl === -1) break
          lineStart = nl + 1
        }
        append(source.slice(i, fenceEnd))
        i = fenceEnd
        continue
      }
    }

    // 行内代码：等长反引号串闭合，内容不转换（可跨行，同 CommonMark）。
    if (ch === "`") {
      let run = 1
      while (source[i + run] === "`") run += 1
      let closeAt = -1
      let k = i + run
      while (k < source.length) {
        if (source[k] !== "`") {
          k += 1
          continue
        }
        let r = 1
        while (source[k + r] === "`") r += 1
        if (r === run) {
          closeAt = k
          break
        }
        k += r
      }
      if (closeAt === -1) {
        append("`".repeat(run))
        i += run
      } else {
        append(source.slice(i, closeAt + run))
        i = closeAt + run
      }
      continue
    }

    if (ch === "\\") {
      const next = source[i + 1]
      // \\ 是转义的反斜杠本身，其后字符不参与定界符判断。
      if (next === "\\") {
        append("\\\\")
        i += 2
        continue
      }
      if (next === "(") {
        const close = findInlineClose(source, i + 2)
        if (close !== -1) {
          let start = i + 2
          while (start < close && /\s/.test(source[start])) start += 1
          let end = close
          while (end > start && /\s/.test(source[end - 1])) end -= 1
          append("$")
          append(source.slice(start, end))
          append("$")
          i = close + 2
          continue
        }
      }
      if (next === "[") {
        const close = findDisplayClose(source, i + 2)
        if (close !== -1) {
          append(lineHasContent ? "\n\n$$\n" : "$$\n")
          // 定界符所在行只剩空白时直接跳到下一行，避免公式块内多出空行。
          const nl = source.indexOf("\n", i + 2)
          const rest = source.slice(i + 2, nl === -1 ? source.length : nl)
          i = /^[ \t\r]*$/.test(rest) ? (nl === -1 ? source.length : nl + 1) : i + 2
          inDisplay = true
          continue
        }
      }
      append("\\")
      i += 1
      continue
    }

    append(ch)
    i += 1
  }

  return out
}

/** 行内数学的闭合 \) 必须在同一行；跳过 \\ 转义对。 */
function findInlineClose(source: string, from: number): number {
  let k = from
  while (k < source.length) {
    const ch = source[k]
    if (ch === "\n") return -1
    if (ch === "\\") {
      if (source[k + 1] === "\\") {
        k += 2
        continue
      }
      if (source[k + 1] === ")") return k
    }
    k += 1
  }
  return -1
}

/** 块级数学可跨行；同样跳过 \\ 转义对。 */
function findDisplayClose(source: string, from: number): number {
  let k = from
  while (k < source.length) {
    const ch = source[k]
    if (ch === "\\") {
      if (source[k + 1] === "\\") {
        k += 2
        continue
      }
      if (source[k + 1] === "]") return k
    }
    k += 1
  }
  return -1
}
