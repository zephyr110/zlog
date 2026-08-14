// preload 的 contextBridge.exposeInMainWorld("zlog", …) 已在全局声明同名
// 绑定，这里再 `const zlog = window.zlog` 会抛 "Identifier 'zlog' has
// already been declared" 使整个脚本失效——必须换名。
const zlogApi = window.zlog
const mode = new URLSearchParams(location.search).get("mode") || "settings"
const isFirstRun = mode === "firstrun"

document.title = isFirstRun ? "Zlog 首次设置" : "Zlog 设置"
document.getElementById("title").textContent = isFirstRun ? "Zlog 首次设置" : "Zlog 设置"
document.getElementById("subtitle").textContent = isFirstRun
  ? "创建管理员账号；同步可稍后在设置中补充（可选）。"
  : "同步数据库 URL 与 Token 为空时不启用同步。"
document.getElementById("saveBtn").textContent = isFirstRun ? "保存并启动" : "保存"
if (isFirstRun) {
  // 首启向导里服务器尚未启动，「立即同步」无意义——隐藏
  document.getElementById("syncBtn").style.display = "none"
  // 首字段自动聚焦，回车直接提交
  document.getElementById("username").focus()
} else {
  document.getElementById("passwordFields").style.display = "none"
}

const statusEl = document.getElementById("status")
function showStatus(text, isError = false) {
  statusEl.textContent = text
  statusEl.classList.toggle("error", isError)
}
// 常见同步错误的用户可读说明（原始错误可能晦涩，如 libsql 的
// "invalid local state: db file exists but metadata file does not"）
const SYNC_ERROR_HINTS = [
  {
    match: /invalid local state/,
    hint: "本地数据库由纯本地模式创建，无法原地启用同步。请删除用户数据目录中的 zlog.db（先备份）后重启应用。",
  },
]

function renderStatus(s) {
  if (!s) return
  let error = s.lastSyncError
  if (error) {
    for (const { match, hint } of SYNC_ERROR_HINTS) {
      if (match.test(error)) {
        error = `${hint}\n（原始错误：${error}）`
        break
      }
    }
  }
  const lines = [
    `同步：${s.configured ? "已配置" : "未配置"}${s.syncing ? "（同步中…）" : ""}`,
    s.lastSyncAt ? `上次同步：${new Date(s.lastSyncAt).toLocaleString()}` : "尚未同步",
    error ? `最近错误：${error}` : "",
  ]
  showStatus(lines.filter(Boolean).join("\n"), !!error)
}

async function refreshStatus() {
  renderStatus(await zlogApi.getSyncStatus())
}

const saveBtn = document.getElementById("saveBtn")
async function doSave() {
  const cfg = {
    username: document.getElementById("username").value.trim(),
    password: document.getElementById("password").value,
    password2: document.getElementById("password2").value,
    syncUrl: document.getElementById("syncUrl").value.trim(),
    syncToken: document.getElementById("syncToken").value.trim(),
  }
  // 校验失败：定位到出问题的字段并给出 aria-invalid
  const username = document.getElementById("username")
  const password = document.getElementById("password")
  const password2 = document.getElementById("password2")
  for (const el of [username, password, password2]) el.removeAttribute("aria-invalid")
  if (isFirstRun) {
    if (!cfg.username) {
      username.setAttribute("aria-invalid", "true")
      username.focus()
      showStatus("请填写用户名。", true)
      return
    }
    if (cfg.password.length < 6 || cfg.password !== cfg.password2) {
      password.setAttribute("aria-invalid", "true")
      password2.setAttribute("aria-invalid", "true")
      password.focus()
      showStatus("密码至少 6 位，且两次输入一致。", true)
      return
    }
  }
  // 同步 URL 格式校验：填错（如误填用户名）会导致 libsql 解析失败、
  // 服务器进程 panic 崩溃（真实事故：syncUrl 被填成 "admin"）
  if (cfg.syncUrl && !/^(libsql|file):\/\//.test(cfg.syncUrl)) {
    const syncUrl = document.getElementById("syncUrl")
    syncUrl.setAttribute("aria-invalid", "true")
    syncUrl.focus()
    showStatus("数据库 URL 需以 libsql:// 开头，如 libsql://your-db.turso.io。", true)
    return
  }
  // 保存期间禁用按钮，防止双击触发两次「停止→启动」竞态
  saveBtn.disabled = true
  showStatus("保存中…")
  try {
    const res = await zlogApi.saveConfig(cfg)
    if (res && res.ok) {
      showStatus("已保存，博客即将打开。")
      if (!isFirstRun) refreshStatus()
    } else {
      showStatus((res && res.error) || "保存失败，请重试。", true)
      saveBtn.disabled = false
    }
  } catch {
    showStatus("保存失败，请重试。", true)
    saveBtn.disabled = false
  }
}
saveBtn.addEventListener("click", doSave)
// 回车即提交（首启主流程的键盘可达性）
for (const id of ["username", "password", "password2", "syncUrl", "syncToken"]) {
  document.getElementById(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSave()
  })
}

document.getElementById("syncBtn").addEventListener("click", async () => {
  await zlogApi.runSyncNow()
  refreshStatus()
})

document.getElementById("openBtn").addEventListener("click", () => zlogApi.openDataDir())
refreshStatus()
