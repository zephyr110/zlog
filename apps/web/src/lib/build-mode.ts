/**
 * 构建期没有可用数据库时的判定：桌面 standalone（NEXT_DESKTOP）本就没有库，
 * 线上构建若预检发现 Turso 暂不可用则由 scripts/build.mjs 置 ZLOG_BUILD_NO_DB。
 * 此时 generateStaticParams 必须返回空数组，让这些路径留到请求时按需渲染。
 */
export function skipStaticParamsAtBuild(): boolean {
  return process.env.NEXT_DESKTOP === "true" || process.env.ZLOG_BUILD_NO_DB === "1"
}
