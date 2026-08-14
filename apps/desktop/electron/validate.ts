/**
 * 同步 URL 校验：唯一权威实现。
 * 渲染层（settings.js）与主进程（main.ts）必须保持一致——两边都引用
 * 这里的规则描述；渲染层无法 import TS 模块，其内联正则与这里同步维护。
 *
 * 注意：只接受 libsql://——同步 URL 必须是远端 Turso 库（file: 无同步
 * 语义），且非法值会让 libsql 原生客户端解析时 panic、拖垮整个服务器。
 */
export function isValidSyncUrl(url: string | undefined): boolean {
  return !!url && /^libsql:\/\//.test(url)
}
