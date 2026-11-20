import { defaultExclude, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    // tests/ 是 Playwright 冒烟测试目录；release/ 是打包产物，内含
    // standalone 的 web 测试副本，别名解析环境不同会报假失败
    exclude: [...defaultExclude, "tests/**", "release/**"],
  },
})
