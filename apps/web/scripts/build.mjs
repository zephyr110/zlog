import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDatabaseUnavailable } from "./db-availability.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const webDir = join(here, "..")
const repoRoot = join(webDir, "..", "..")
const localNext = join(
  webDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next"
)
const nextBin = existsSync(localNext) ? localNext : "next"

const PROBE_TIMEOUT_MS = 10_000
const PROBE_ATTEMPTS = 3

/** 按 Next 的优先级补全 .env；loadEnvFile 不覆盖已有值，故从高到低加载。 */
function loadEnvFiles() {
  if (typeof process.loadEnvFile !== "function") return
  for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    try {
      process.loadEnvFile(join(webDir, name))
    } catch {}
  }
}

async function probeDatabase() {
  const url = process.env.TURSO_DATABASE_URL
  if (!url) return { status: "missing" }

  let createClient
  try {
    // @libsql/client 是 @zlog/database 的依赖，pnpm 严格布局下只能从那里解析
    createClient = createRequire(join(repoRoot, "packages", "database", "package.json"))(
      "@libsql/client"
    ).createClient
  } catch {
    return { status: "missing" }
  }

  let client
  try {
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  } catch (error) {
    return { status: "config-error", error }
  }

  let lastError
  try {
    for (let attempt = 1; attempt <= PROBE_ATTEMPTS; attempt++) {
      let timer
      try {
        await Promise.race([
          client.execute("SELECT 1"),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              reject(
                Object.assign(new Error(`probe timed out after ${PROBE_TIMEOUT_MS}ms`), {
                  code: "PROBE_TIMEOUT",
                })
              )
            }, PROBE_TIMEOUT_MS)
          }),
        ])
        return { status: "ok" }
      } catch (error) {
        lastError = error
        if (!isDatabaseUnavailable(error)) return { status: "config-error", error }
        if (attempt < PROBE_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 1_000))
        }
      } finally {
        clearTimeout(timer)
      }
    }
    return { status: "unavailable", error: lastError }
  } finally {
    try {
      client.close()
    } catch {}
  }
}

function runNextBuild(env) {
  const result = spawnSync(nextBin, ["build"], {
    cwd: webDir,
    env,
    stdio: "inherit",
    // Windows 上 .cmd shim 必须经 shell 启动（与 desktop 的 standalone 脚本一致）
    shell: process.platform === "win32",
  })
  return result.status ?? 1
}

/**
 * 远端不可用时本次构建不预热任何读库页面：注入 force-dynamic，并用
 * ZLOG_BUILD_NO_DB 让动态路由的 generateStaticParams 返回空（force-dynamic
 * 本身不跳过该阶段）。构建后无条件还原源码，失败也不能污染工作树。
 */
function runDegradedBuild() {
  const toggle = join(webDir, "scripts", "toggle-force-dynamic.mjs")
  const toggleRun = (action) =>
    spawnSync(process.execPath, [toggle, action], { cwd: webDir, stdio: "inherit" }).status ?? 1

  let code = 0
  try {
    if (toggleRun("add") !== 0) code = 1
    else code = runNextBuild({ ...process.env, ZLOG_BUILD_NO_DB: "1" })
  } finally {
    if (toggleRun("remove") !== 0) code = code || 1
  }
  return code
}

loadEnvFiles()

// 桌面 standalone 构建没有数据库，prepare-standalone 已自行注入 force-dynamic
if (process.env.NEXT_DESKTOP !== "true") {
  const probe = await probeDatabase()

  if (probe.status === "config-error") {
    console.error(
      `[build] database preflight failed (configuration error): ${probe.error?.message ?? probe.error}`
    )
    process.exit(1)
  }

  if (probe.status === "unavailable") {
    console.warn(
      `[build] database unavailable: ${probe.error?.message ?? "unknown error"}\n` +
        "[build] degrading this build: no prerender, every page renders at request time"
    )
    process.exit(runDegradedBuild())
  }
}

process.exit(runNextBuild(process.env))
