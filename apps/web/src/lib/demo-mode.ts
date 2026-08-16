/**
 * 演示环境（访客体验站）开关。DEMO_MODE=true 时：
 * - 服务端拦截修改密码（/api/auth/change-password 返回 403）
 * - 分析接口返回 mock 数据（见 demo-analytics.ts）
 * - 客户端登录表单预填演示账号（NEXT_PUBLIC_DEMO_MODE 构建时内联）
 *
 * 本文件必须保持 client-safe（admin 登录页 import）：不能引用 node:/
 * undici。服务端同时认 DEMO_MODE 与 NEXT_PUBLIC_DEMO_MODE，客户端只有
 * NEXT_PUBLIC_ 变体被 Next 内联（另一个编译为 undefined，检查安全）。
 */
export const DEMO_ACCOUNT = {
  username: "admin-test",
  password: "admin123456",
}

export function isDemoMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
    process.env.DEMO_MODE === "true"
  )
}
