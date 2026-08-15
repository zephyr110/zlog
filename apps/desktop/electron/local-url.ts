function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1"
}

/** 博客窗口是否应留下该 URL（站内）。localhost 与 127.0.0.1 视为同一台，
 *  但协议必须与本地服务一致，避免把同端口的 https 误当成应用。 */
export function isDesktopLocalUrl(raw: string, serverUrl: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    const server = new URL(serverUrl)
    if (u.origin === server.origin) return true
    return (
      u.protocol === server.protocol &&
      isLoopbackHost(u.hostname) &&
      u.port === server.port
    )
  } catch {
    return false
  }
}
