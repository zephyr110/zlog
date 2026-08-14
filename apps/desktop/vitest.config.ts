import { defaultExclude, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    // tests/ 是 Playwright 冒烟测试目录，不让 vitest 采集
    exclude: [...defaultExclude, "tests/**"],
  },
})
