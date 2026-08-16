const GITHUB_API = "https://api.github.com"
const UPLOAD_TIMEOUT_MS = 30_000

function repoEnv(): { owner: string; repo: string } {
  const full = process.env.BLOG_IMG_REPO ?? "zephyr110/blog-img"
  const [owner, repo] = full.split("/")
  if (!owner || !repo) {
    throw new Error("BLOG_IMG_REPO must be in owner/repo format")
  }
  return { owner, repo }
}

function branch(): string {
  return process.env.BLOG_IMG_BRANCH ?? "main"
}

function token(): string {
  const value = process.env.BLOG_IMG_GITHUB_TOKEN
  if (!value) {
    throw new Error(
      "BLOG_IMG_GITHUB_TOKEN is required. Generate a fine-grained token " +
        "scoped to the blog-img repo with Contents: Read and write."
    )
  }
  return value
}

function apiHeaders() {
  return {
    Authorization: `Bearer ${token()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
}

function cdnBase(): string {
  return (
    process.env.BLOG_IMG_CDN_BASE ??
    "https://cdn.jsdelivr.net/gh/zephyr110/blog-img"
  )
}

export function cdnUrl(filename: string): string {
  return `${cdnBase()}/${filename}`
}

/** Pushes a file to the blog-img repo via the Contents API (normal commit,
 *  not force push — unaffected by branch protection). Returns the new sha. */
export async function uploadToGithub(
  filename: string,
  buffer: Buffer
): Promise<{ sha: string }> {
  const { owner, repo } = repoEnv()
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...apiHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `upload ${filename}`,
        content: buffer.toString("base64"), // Contents API requires base64
        branch: branch(),
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`GitHub upload failed (${res.status}): ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    return { sha: data.content?.sha as string }
  } finally {
    clearTimeout(timer)
  }
}

/** Deletes a file from the blog-img repo. Idempotent: a 404 (file already
 *  gone) is treated as success. Uses the stored sha when available. */
export async function deleteFromGithub(
  filename: string,
  sha?: string | null
): Promise<void> {
  const { owner, repo } = repoEnv()
  const path = encodeURIComponent(filename)

  let fileSha = sha
  if (!fileSha) {
    const lookup = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch()}`,
      { headers: apiHeaders() }
    )
    if (lookup.status === 404) return // already gone
    if (!lookup.ok) {
      throw new Error(`GitHub lookup failed (${lookup.status})`)
    }
    fileSha = ((await lookup.json()) as { sha: string }).sha
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?branch=${branch()}`,
      {
        method: "DELETE",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: `delete ${filename}`, sha: fileSha }),
        signal: controller.signal,
      }
    )
    if (res.status === 404) return // idempotent
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`GitHub delete failed (${res.status}): ${body.slice(0, 200)}`)
    }
  } finally {
    clearTimeout(timer)
  }
}
