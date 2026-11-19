/**
 * 构建期读库失败是否属于「远端暂不可用」。
 *
 * BLOCKED（Turso 配额封禁）与网络/超时类错误可以让本次构建降级为动态渲染；
 * 鉴权、URL 等配置错误必须让构建失败——降级只会把问题藏到运行时。
 */
export function isDatabaseUnavailable(error) {
  // libsql 把原始错误挂在 cause 上（LibsqlError → ResponseError）
  const chain = []
  const seen = new Set()
  for (let current = error; current && !seen.has(current); current = current.cause) {
    seen.add(current)
    chain.push(current)
  }

  return chain.some((err) => {
    const code = typeof err?.code === "string" ? err.code : ""
    if (code === "BLOCKED" || code === "PROBE_TIMEOUT") return true

    const message = String(err?.message ?? "")
    return (
      /operation was blocked/i.test(message) ||
      /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(message) ||
      /timed? ?out/i.test(message)
    )
  })
}
