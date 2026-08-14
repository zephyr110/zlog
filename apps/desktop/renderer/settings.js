const zlog = window.zlog
const mode = new URLSearchParams(location.search).get("mode") || "settings"
const isFirstRun = mode === "firstrun"

document.title = isFirstRun ? "Zlog 首次设置" : "Zlog 设置"
document.getElementById("title").textContent = isFirstRun ? "Zlog 首次设置" : "Zlog 设置"
document.getElementById("subtitle").textContent = isFirstRun
  ? "创建管理员账号；同步可稍后在设置中补充（可选）。"
  : "同步数据库 URL 与 Token 为空时不启用同步。"
if (!isFirstRun) document.getElementById("passwordFields").style.display = "none"

const statusEl = document.getElementById("status")
function showStatus(text, isError = false) {
  statusEl.textContent = text
  statusEl.classList.toggle("error", isError)
}
function renderStatus(s) {
  if (!s) return
  const lines = [
    `同步：${s.configured ? "已配置" : "未配置"}${s.syncing ? "（同步中…）" : ""}`,
    s.lastSyncAt ? `上次同步：${new Date(s.lastSyncAt).toLocaleString()}` : "尚未同步",
    s.lastSyncError ? `最近错误：${s.lastSyncError}` : "",
  ]
  showStatus(lines.filter(Boolean).join("\n"))
}

async function refreshStatus() {
  renderStatus(await zlog.getSyncStatus())
}

const saveBtn = document.getElementById("saveBtn")
saveBtn.addEventListener("click", async () => {
  const cfg = {
    username: document.getElementById("username").value.trim(),
    password: document.getElementById("password").value,
    password2: document.getElementById("password2").value,
    syncUrl: document.getElementById("syncUrl").value.trim(),
    syncToken: document.getElementById("syncToken").value.trim(),
  }
  if (isFirstRun && (!cfg.username || cfg.password !== cfg.password2 || cfg.password.length < 6)) {
    showStatus("请填写用户名，且两次密码一致并至少 6 位。", true)
    return
  }
  // 保存期间禁用按钮，防止双击触发两次「停止→启动」竞态
  saveBtn.disabled = true
  showStatus("保存中…")
  try {
    const res = await zlog.saveConfig(cfg)
    if (res && res.ok) {
      showStatus("已保存，博客即将打开。")
      if (!isFirstRun) refreshStatus()
    } else {
      showStatus("保存失败，请重试。", true)
      saveBtn.disabled = false
    }
  } catch {
    showStatus("保存失败，请重试。", true)
    saveBtn.disabled = false
  }
})

// 首启向导里服务器尚未启动，「立即同步」会静默失败——禁用并给出原因提示
if (isFirstRun) {
  const syncBtn = document.getElementById("syncBtn")
  syncBtn.disabled = true
  syncBtn.title = "保存并启动博客后，可在设置中同步"
}

document.getElementById("syncBtn").addEventListener("click", async () => {
  await zlog.runSyncNow()
  refreshStatus()
})

document.getElementById("openBtn").addEventListener("click", () => zlog.openDataDir())
refreshStatus()
