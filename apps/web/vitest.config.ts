import { fileURLToPath } from "node:url"
import { defaultExclude, defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      // Mirror tsconfig paths so lib modules can use "@/" imports.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // `.next` 必须显式排除：desktop 的 build:standalone 会把整棵 apps/web
    // （含 test/）复制进 .next/standalone，本地构建后跑 vitest 会把每个
    // 测试文件连产物副本跑两遍；副本里别名/mock 的解析环境不同，会出
    // 假失败（如 site-config-fallbacks 副本拿到编译期默认值而非 mock 的 DB 行）。
    exclude: [...defaultExclude, "**/.next/**"],
    // Deterministic date handling — toUtcTimestamp parses local time and
    // must behave the same on every machine/CI runner.
    env: { TZ: "UTC" },
  },
})
