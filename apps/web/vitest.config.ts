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
    exclude: [...defaultExclude],
    // Deterministic date handling — toUtcTimestamp parses local time and
    // must behave the same on every machine/CI runner.
    env: { TZ: "UTC" },
  },
})
