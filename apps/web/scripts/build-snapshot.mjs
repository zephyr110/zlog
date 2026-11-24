import { copyFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

/** 只有本站仓库的 Vercel 构建可以吃仓库内置快照——快照是站长的文章。
 *  Vercel upload deployment（桌面一键部署）没有 VERCEL_GIT_*，必须排除，
 *  否则数据库不可用时会把站长的内容显示到别人的站点上。 */
export const SNAPSHOT_REPO = { owner: "zephyr110", slug: "zlog" }

export function isSnapshotBuildEligible(env) {
  if (env.NEXT_DESKTOP === "true") return false
  if (env.VERCEL !== "1") return true
  return (
    env.VERCEL_GIT_REPO_OWNER === SNAPSHOT_REPO.owner &&
    env.VERCEL_GIT_REPO_SLUG === SNAPSHOT_REPO.slug
  )
}

/**
 * 远端不可用（配额/封禁/网络）时用快照预渲染；Vercel 上没配库（通常是
 * Preview）也走快照，否则预览页全空。本地没配库仍按原行为构建。
 */
export function shouldBuildFromSnapshot({ status, snapshotExists, env }) {
  if (!snapshotExists) return false
  if (!isSnapshotBuildEligible(env)) return false
  if (status === "unavailable") return true
  return status === "missing" && env.VERCEL === "1"
}

/** 快照构建必须完全断开远端：鉴权/同步变量会把读带回被挡的库。 */
export function snapshotBuildEnv(baseEnv, snapshotPath) {
  const env = { ...baseEnv }
  delete env.TURSO_AUTH_TOKEN
  delete env.TURSO_SYNC_URL
  delete env.TURSO_SYNC_INTERVAL
  delete env.ZLOG_BUILD_NO_DB
  env.TURSO_DATABASE_URL = `file:${snapshotPath}`
  return env
}

/** 复制到可写临时目录：构建里的建表/迁移可能写文件，不能污染仓库内快照。 */
export function withSnapshotCopy(sourcePath, run) {
  const dir = mkdtempSync(join(tmpdir(), "zlog-snapshot-build-"))
  const target = join(dir, basename(sourcePath))
  copyFileSync(sourcePath, target)
  try {
    return run(target)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
