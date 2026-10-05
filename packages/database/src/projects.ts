import { type Client } from "@libsql/client"
import { requireDb } from "./db"
import { scheduleSync } from "./sync"

// ── Schema ──────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  repo_url TEXT NOT NULL DEFAULT '',
  demo_url TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_sort ON projects(sort_order);
`

let tableReady: Promise<void> | null = null

async function ensureTable(db: Client): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.executeMultiple(SCHEMA)
    })().catch((err) => {
      tableReady = null // reset on failure so next call retries
      throw err
    })
  }
  await tableReady
}

// ── Records ─────────────────────────────────────────────────────────────

export interface Project {
  id: number
  title: string
  description: string
  repoUrl: string
  demoUrl: string
  cover: string
  tags: string[]
  visible: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** create/update 共用的可写字段集。 */
export interface ProjectInput {
  title: string
  description: string
  repoUrl: string
  demoUrl: string
  cover: string
  tags: string[]
  visible: boolean
}

export type ProjectUpdate = Partial<ProjectInput>

const MAX_TAGS = 8
const MAX_TAG_LENGTH = 24

/** trim + 去重（保序）+ 截断：最多 8 个、每个最长 24 字符。 */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = []
  for (const raw of tags) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH)
    if (!tag || out.includes(tag)) continue
    out.push(tag)
    if (out.length === MAX_TAGS) break
  }
  return out
}

/** tags 列是 JSON 字符串；坏 JSON / 非数组 / 非字符串元素一律容错为 []。 */
function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string") return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is string => typeof t === "string")
  } catch {
    return []
  }
}

const SELECT_COLS =
  "id, title, description, repo_url, demo_url, cover, tags, visible, sort_order, created_at, updated_at"

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: Number(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    repoUrl: String(row.repo_url ?? ""),
    demoUrl: String(row.demo_url ?? ""),
    cover: String(row.cover ?? ""),
    tags: parseTags(row.tags),
    visible: Number(row.visible ?? 1) !== 0,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }
}

// ── Queries ─────────────────────────────────────────────────────────────

/** 后台列表：全量，按展示顺序。 */
export async function listProjects(): Promise<Project[]> {
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute(
    `SELECT ${SELECT_COLS} FROM projects ORDER BY sort_order ASC, id ASC`
  )
  return result.rows.map((row) =>
    rowToProject(row as unknown as Record<string, unknown>)
  )
}

/** 前台列表：只含上架项。 */
export async function listVisibleProjects(): Promise<Project[]> {
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute(
    `SELECT ${SELECT_COLS} FROM projects WHERE visible = 1 ORDER BY sort_order ASC, id ASC`
  )
  return result.rows.map((row) =>
    rowToProject(row as unknown as Record<string, unknown>)
  )
}

/** 新项目置顶：sort_order = MIN-1（表空时为 0），建完立刻在列表最上面。 */
export async function createProject(input: ProjectInput): Promise<Project> {
  const db = requireDb()
  await ensureTable(db)
  const min = await db.execute("SELECT MIN(sort_order) AS m FROM projects")
  const m = min.rows[0]?.m
  const sortOrder = m === null || m === undefined ? 0 : Number(m) - 1
  const result = await db.execute({
    sql: `INSERT INTO projects (title, description, repo_url, demo_url, cover, tags, visible, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING ${SELECT_COLS}`,
    args: [
      input.title,
      input.description,
      input.repoUrl,
      input.demoUrl,
      input.cover,
      JSON.stringify(normalizeTags(input.tags)),
      input.visible ? 1 : 0,
      sortOrder,
    ],
  })
  scheduleSync()
  return rowToProject(result.rows[0] as unknown as Record<string, unknown>)
}

/** 局部更新；无字段可写时原样返回当前行；id 不存在返回 null。 */
export async function updateProject(
  id: number,
  patch: ProjectUpdate
): Promise<Project | null> {
  const db = requireDb()
  await ensureTable(db)
  const sets: string[] = []
  const args: (string | number)[] = []
  if (patch.title !== undefined) {
    sets.push("title = ?")
    args.push(patch.title)
  }
  if (patch.description !== undefined) {
    sets.push("description = ?")
    args.push(patch.description)
  }
  if (patch.repoUrl !== undefined) {
    sets.push("repo_url = ?")
    args.push(patch.repoUrl)
  }
  if (patch.demoUrl !== undefined) {
    sets.push("demo_url = ?")
    args.push(patch.demoUrl)
  }
  if (patch.cover !== undefined) {
    sets.push("cover = ?")
    args.push(patch.cover)
  }
  if (patch.tags !== undefined) {
    sets.push("tags = ?")
    args.push(JSON.stringify(normalizeTags(patch.tags)))
  }
  if (patch.visible !== undefined) {
    sets.push("visible = ?")
    args.push(patch.visible ? 1 : 0)
  }
  if (sets.length === 0) {
    const cur = await db.execute({
      sql: `SELECT ${SELECT_COLS} FROM projects WHERE id = ?`,
      args: [id],
    })
    const row = cur.rows[0]
    return row
      ? rowToProject(row as unknown as Record<string, unknown>)
      : null
  }
  sets.push("updated_at = datetime('now')")
  const result = await db.execute({
    sql: `UPDATE projects SET ${sets.join(", ")} WHERE id = ? RETURNING ${SELECT_COLS}`,
    args: [...args, id],
  })
  const row = result.rows[0]
  if (!row) return null
  scheduleSync()
  return rowToProject(row as unknown as Record<string, unknown>)
}

export async function deleteProject(id: number): Promise<boolean> {
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute({
    sql: "DELETE FROM projects WHERE id = ?",
    args: [id],
  })
  if (result.rowsAffected > 0) scheduleSync()
  return result.rowsAffected > 0
}

/** 上移/下移：与相邻行交换位置，随后把整表 sort_order 规范化为 0..n-1
 *  （顺带修掉历史重复值）。已在首/末位或 id 不存在时返回 false。 */
export async function moveProject(
  id: number,
  direction: "up" | "down"
): Promise<boolean> {
  const db = requireDb()
  await ensureTable(db)
  const list = await listProjects()
  const index = list.findIndex((p) => p.id === id)
  if (index === -1) return false
  const target = direction === "up" ? index - 1 : index + 1
  if (target < 0 || target >= list.length) return false
  const reordered = [...list]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
  for (let i = 0; i < reordered.length; i++) {
    await db.execute({
      sql: "UPDATE projects SET sort_order = ? WHERE id = ?",
      args: [i, reordered[i].id],
    })
  }
  scheduleSync()
  return true
}
