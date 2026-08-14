// preload 的 contextBridge.exposeInMainWorld("zlog", …) 已在全局声明同名
// 绑定，这里再 `const zlog = window.zlog` 会抛 "Identifier 'zlog' has
// already been declared" 使整个脚本失效——必须换名。
const zlogApi = window.zlog
const mode = new URLSearchParams(location.search).get("mode") || "settings"
const isFirstRun = mode === "firstrun"
document.body.classList.add(isFirstRun ? "mode-firstrun" : "mode-settings")
document.title = isFirstRun ? "Zlog 首次设置" : "Zlog 设置"

// ── 模式差异 ──────────────────────────────────────────────────────────
// 首启：品牌头部 + 全宽主按钮；隐藏侧栏、内容区标题、立即同步、流量分析
if (isFirstRun) {
  // 首启向导保持最小化：同步按钮、流量分析/数据面板、内容区标题全部隐藏
  document.getElementById("syncBtn").style.display = "none"
  document.getElementById("panel-analytics").style.display = "none"
  document.getElementById("panel-data").style.display = "none"
  document.getElementById("contentHeader").style.display = "none"
  document.getElementById("username").focus()
} else {
  document.getElementById("passwordFields").style.display = "none"
  document.getElementById("saveBtnLabel").textContent = "保存"
  document.getElementById("title2").textContent = "同步设置"
  document.getElementById("subtitle2").textContent =
    "配置 Turso 双向同步；未配置则纯本地运行"
  // 预填已保存的配置（C1：表单必须回显存量值，否则空字段会被当
  // 成"清空"保存，静默抹掉流量分析凭据）。密码类字段同样回显，
  // 用户清空即表示删除。
  zlogApi.loadConfig().then((cfg) => {
    if (!cfg) return
    const set = (id, v) => { document.getElementById(id).value = v || "" }
    set("syncUrl", cfg.syncUrl)
    set("syncToken", cfg.syncToken)
    set("vercelApiToken", cfg.vercelApiToken)
    set("vercelProjectId", cfg.vercelProjectId)
    set("vercelTeamId", cfg.vercelTeamId)
    set("gaPropertyId", cfg.gaPropertyId)
    set("gaClientEmail", cfg.gaClientEmail)
    set("gaPrivateKey", cfg.gaPrivateKey)
  })
}

// ── 侧栏面板切换（设置模式） ────────────────────────────────────────
const PANEL_META = {
  sync: { title: "同步设置", subtitle: "配置 Turso 双向同步；未配置则纯本地运行" },
  analytics: { title: "流量分析", subtitle: "线上站点流量的只读报表；桌面端不发送埋点数据" },
  data: { title: "数据目录", subtitle: "博客数据与备份位置" },
}
if (!isFirstRun) {
  for (const btn of document.querySelectorAll(".nav-item")) {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b === btn))
      for (const panel of document.querySelectorAll(".panel")) {
        panel.classList.toggle("active", panel.id === `panel-${btn.dataset.panel}`)
      }
      const meta = PANEL_META[btn.dataset.panel]
      document.getElementById("title2").textContent = meta.title
      document.getElementById("subtitle2").textContent = meta.subtitle
    })
  }
}

// ── 按钮级 spinner ────────────────────────────────────────────────────
function setButtonSpinner(btn, on) {
  if (on && !btn.querySelector(".spinner")) {
    const span = document.createElement("span")
    span.className = "spinner"
    span.setAttribute("aria-hidden", "true")
    btn.prepend(span)
  } else if (!on) {
    btn.querySelector(".spinner")?.remove()
  }
}

// ── 状态区 ────────────────────────────────────────────────────────────
const statusEl = document.getElementById("status")
function showStatus(text, isError = false) {
  statusEl.textContent = text
  statusEl.classList.toggle("error", isError)
}
// 常见同步错误的用户可读说明（原始错误可能晦涩）
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
  // 首启向导不显示同步面板，状态区只呈现错误（同步行无意义）
  const lines = isFirstRun
    ? [error ? `最近错误：${error}` : ""]
    : [
        `同步：${s.configured ? "已配置" : "未配置"}${s.syncing ? "（同步中…）" : ""}`,
        s.lastSyncAt ? `上次同步：${new Date(s.lastSyncAt).toLocaleString()}` : "尚未同步",
        error ? `最近错误：${error}` : "",
      ]
  showStatus(lines.filter(Boolean).join("\n"), !!error)
  // 同步按钮 spinner 跟随同步状态（设置模式）
  const syncBtn = document.getElementById("syncBtn")
  if (syncBtn) setButtonSpinner(syncBtn, !!s.syncing)
}

async function refreshStatus() {
  renderStatus(await zlogApi.getSyncStatus())
}

// ── 保存 ──────────────────────────────────────────────────────────────
const saveBtn = document.getElementById("saveBtn")
async function doSave() {
  // 重入保护：保存进行中（按钮已禁用）时忽略 Enter 连发
  if (saveBtn.disabled) return
  const cfg = {
    username: document.getElementById("username").value.trim(),
    password: document.getElementById("password").value,
    password2: document.getElementById("password2").value,
    syncUrl: document.getElementById("syncUrl").value.trim(),
    syncToken: document.getElementById("syncToken").value.trim(),
    vercelApiToken: document.getElementById("vercelApiToken").value.trim(),
    vercelProjectId: document.getElementById("vercelProjectId").value.trim(),
    vercelTeamId: document.getElementById("vercelTeamId").value.trim(),
    gaPropertyId: document.getElementById("gaPropertyId").value.trim(),
    gaClientEmail: document.getElementById("gaClientEmail").value.trim(),
    gaPrivateKey: document.getElementById("gaPrivateKey").value.trim(),
  }
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
  // 同步 URL 格式校验：填错（如误填用户名）会让 libsql 解析 panic 崩溃。
  // 与主进程 validate.ts 保持一致（渲染层无法 import，需同步维护）
  if (cfg.syncUrl && !/^libsql:\/\//.test(cfg.syncUrl)) {
    const syncUrl = document.getElementById("syncUrl")
    syncUrl.setAttribute("aria-invalid", "true")
    syncUrl.focus()
    showStatus("数据库 URL 需以 libsql:// 开头，如 libsql://your-db.turso.io", true)
    return
  }
  saveBtn.disabled = true
  setButtonSpinner(saveBtn, true)
  showStatus("保存中…")
  try {
    const res = await zlogApi.saveConfig(cfg)
    if (res && res.ok) {
      showStatus(isFirstRun ? "已保存，博客即将打开。" : "已保存")
      if (!isFirstRun) {
        // 设置模式窗口保持打开：复位按钮与 spinner
        saveBtn.disabled = false
        setButtonSpinner(saveBtn, false)
        refreshStatus()
      }
    } else {
      showStatus((res && res.error) || "保存失败，请重试。", true)
      saveBtn.disabled = false
      setButtonSpinner(saveBtn, false)
    }
  } catch {
    showStatus("保存失败，请重试。", true)
    saveBtn.disabled = false
    setButtonSpinner(saveBtn, false)
  }
}
saveBtn.addEventListener("click", doSave)
for (const id of [
  "username", "password", "password2", "syncUrl", "syncToken",
  "vercelApiToken", "vercelProjectId", "vercelTeamId",
  "gaPropertyId", "gaClientEmail", "gaPrivateKey",
]) {
  const el = document.getElementById(id)
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSave()
  })
}

// ── 其他操作 ──────────────────────────────────────────────────────────
document.getElementById("syncBtn").addEventListener("click", async () => {
  await zlogApi.runSyncNow()
  refreshStatus()
})
for (const id of ["openBtn", "openBtn2"]) {
  const btn = document.getElementById(id)
  if (btn) btn.addEventListener("click", () => zlogApi.openDataDir())
}

refreshStatus()
