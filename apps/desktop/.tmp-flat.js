const { fetch, ProxyAgent } = require("undici")
const { createProxyDispatcher } = require("./dist/proxy-agent.js")
const { parseTarGz, buildDeployFiles } = require("./dist/vercel-deploy.js")
const { writeFileSync, mkdirSync } = require("node:fs")
const { join } = require("node:path")
const dispatcher = createProxyDispatcher("http://127.0.0.1:7892")
async function get() {
  for (let i = 0; i < 4; i++) {
    try { return await fetch("https://codeload.github.com/zephyr110/zlog/tar.gz/refs/tags/v1.0.0", { dispatcher }) } catch (e) { await new Promise(r => setTimeout(r, 2000)) }
  }
  throw new Error("fetch failed")
}
get().then(async (r) => {
  const gz = Buffer.from(await r.arrayBuffer())
  const entries = parseTarGz(gz)
  const { files } = buildDeployFiles(entries)
  const root = "/Users/zephyr/Code/zlog/apps/desktop/.tmp-flat-root"
  for (const f of files) {
    const p = join(root, f.file)
    mkdirSync(join(p, ".."), { recursive: true })
    writeFileSync(p, f.data)
  }
  console.log("DBG_WRITTEN")
}).catch((e) => console.error("ERR:", e.message))
