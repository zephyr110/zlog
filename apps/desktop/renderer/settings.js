// preload 的 contextBridge.exposeInMainWorld("zlog", …) 已在全局声明同名
// 绑定，这里再 `const zlog = window.zlog` 会抛 "Identifier 'zlog' has
// already been declared" 使整个脚本失效——必须换名。
const zlogApi = window.zlog
const mode = new URLSearchParams(location.search).get("mode") || "settings"
const isFirstRun = mode === "firstrun"
document.body.classList.add(isFirstRun ? "mode-firstrun" : "mode-settings")

// ── i18n ───────────────────────────────────────────────────────────────
// 语言由主进程决定（lang.json 单一事实源：system 跟随系统语言、非中英
// 回落英文），本窗口经 preload 的 getLang/setLang 读写；切换后立即重渲染。
const I18N = {
  zh: {
    "nav.sync": "同步设置",
    "nav.analytics": "流量分析",
    "nav.data": "数据目录",
    "nav.lang": "语言",
    "firstrun.title": "Zlog 首次设置",
    "firstrun.subtitle": "创建管理员账号；同步可稍后在设置中补充",
    "settings.title": "Zlog 设置",
    "sync.title": "同步设置",
    "sync.subtitle": "配置 Turso 双向同步；未配置则纯本地运行",
    "analytics.title": "流量分析",
    "analytics.subtitle": "线上站点流量的只读报表；桌面端不发送埋点数据",
    "data.title": "数据目录",
    "data.subtitle": "博客数据与备份位置",
    "lang.title": "语言",
    "lang.subtitle": "界面语言与显示",
    "account.title": "管理员账号",
    "tag.required": "必填",
    "tag.optional": "可选",
    "account.username": "用户名",
    "account.password": "密码",
    "account.confirmPassword": "确认密码",
    "sync.url": "数据库 URL",
    "sync.urlHint": "留空则纯本地运行，之后可在设置中补充",
    "sync.token": "数据库 Token",
    "sync.tokenHint": "在 Turso 控制台创建",
    "sync.help": "首次使用 Turso？",
    "sync.helpSignup": "注册 / 登录",
    "sync.helpGuide": "创建数据库指南",
    "sync.helpTokenDoc": "Token 文档",
    "analytics.vercelToken": "Vercel API Token",
    "analytics.vercelTokenPh": "Vercel 控制台 → Settings → Tokens",
    "analytics.vercelProjectId": "Vercel Project ID",
    "analytics.vercelProjectIdPh": "项目 Settings → General 页面底部",
    "analytics.vercelTeamId": "Vercel Team ID（团队项目才需要）",
    "analytics.vercelTeamIdPh": "留空表示个人项目",
    "analytics.gaId": "GA4 媒体资源 ID",
    "analytics.gaEmail": "GA4 服务账号邮箱",
    "analytics.gaKey": "GA4 服务账号私钥",
    "analytics.hint": "服务账号需在 GA4 媒体资源中授予「查看者」权限；详细步骤见 README 的部署章节",
    "data.pathPre": "数据保存在用户数据目录：",
    "data.pathDb": "（本地数据库）、",
    "data.pathCfg": "（配置）、",
    "data.pathLogs": "（日志）。备份该目录即备份整个博客",
    "data.open": "打开数据目录",
    "lang.label": "界面语言",
    "lang.system": "跟随系统",
    "lang.zh": "中文",
    "lang.en": "English",
    "lang.hint": "跟随系统时，系统语言为中文则显示中文；其他语言一律显示英文",
    "save.firstRun": "保存并启动",
    "save.settings": "保存",
    "sync.now": "立即同步",
    "status.saving": "保存中…",
    "status.saved": "已保存",
    "status.savedFirstRun": "已保存，博客即将打开。",
    "status.saveFailed": "保存失败，请重试。",
    "status.fillUsername": "请填写用户名。",
    "status.passwordRule": "密码至少 6 位，且两次输入一致。",
    "status.syncUrlInvalid": "数据库 URL 需以 libsql:// 开头，如 libsql://your-db.turso.io",
    "status.sync": "同步：",
    "status.configured": "已配置",
    "status.notConfigured": "未配置",
    "status.syncing": "（同步中…）",
    "status.lastSync": "上次同步：",
    "status.neverSynced": "尚未同步",
    "status.recentError": "最近错误：",
    "status.rawError": "（原始错误：",
    "error.invalidState": "本地数据库由纯本地模式创建，无法原地启用同步。请删除用户数据目录中的 zlog.db（先备份）后重启应用。",
  },
  en: {
    "nav.sync": "Sync",
    "nav.analytics": "Analytics",
    "nav.data": "Data Folder",
    "nav.lang": "Language",
    "firstrun.title": "Zlog First-Time Setup",
    "firstrun.subtitle": "Create an admin account; sync can be added later in Settings",
    "settings.title": "Zlog Settings",
    "sync.title": "Sync",
    "sync.subtitle": "Configure Turso two-way sync; without it the app runs fully local",
    "analytics.title": "Analytics",
    "analytics.subtitle": "Read-only reports of your live site traffic; the desktop app sends no telemetry",
    "data.title": "Data Folder",
    "data.subtitle": "Where blog data and backups live",
    "lang.title": "Language",
    "lang.subtitle": "Interface language",
    "account.title": "Admin Account",
    "tag.required": "Required",
    "tag.optional": "Optional",
    "account.username": "Username",
    "account.password": "Password",
    "account.confirmPassword": "Confirm Password",
    "sync.url": "Database URL",
    "sync.urlHint": "Leave empty to run fully local; add it later in Settings",
    "sync.token": "Database Token",
    "sync.tokenHint": "Create one in the Turso dashboard",
    "sync.help": "New to Turso?",
    "sync.helpSignup": "Sign up / Log in",
    "sync.helpGuide": "Database quickstart",
    "sync.helpTokenDoc": "Token docs",
    "analytics.vercelToken": "Vercel API Token",
    "analytics.vercelTokenPh": "Vercel console → Settings → Tokens",
    "analytics.vercelProjectId": "Vercel Project ID",
    "analytics.vercelProjectIdPh": "Bottom of project Settings → General",
    "analytics.vercelTeamId": "Vercel Team ID (teams only)",
    "analytics.vercelTeamIdPh": "Leave empty for personal projects",
    "analytics.gaId": "GA4 Property ID",
    "analytics.gaEmail": "GA4 service account email",
    "analytics.gaKey": "GA4 service account private key",
    "analytics.hint": "Grant the service account \"Viewer\" access on the GA4 property; see the README deployment section for steps",
    "data.pathPre": "Data lives in the user data folder: ",
    "data.pathDb": " (local database), ",
    "data.pathCfg": " (config), ",
    "data.pathLogs": " (logs). Back up that folder to back up the whole blog",
    "data.open": "Open Data Folder",
    "lang.label": "Interface Language",
    "lang.system": "Follow System",
    "lang.zh": "中文",
    "lang.en": "English",
    "lang.hint": "With \"Follow System\", Chinese system languages show Chinese; anything else shows English",
    "save.firstRun": "Save & Start",
    "save.settings": "Save",
    "sync.now": "Sync Now",
    "status.saving": "Saving…",
    "status.saved": "Saved",
    "status.savedFirstRun": "Saved — your blog is about to open.",
    "status.saveFailed": "Save failed, please retry.",
    "status.fillUsername": "Please enter a username.",
    "status.passwordRule": "Password must be at least 6 characters and match the confirmation.",
    "status.syncUrlInvalid": "Database URL must start with libsql://, e.g. libsql://your-db.turso.io",
    "status.sync": "Sync: ",
    "status.configured": "Configured",
    "status.notConfigured": "Not configured",
    "status.syncing": " (syncing…)",
    "status.lastSync": "Last sync: ",
    "status.neverSynced": "Never synced",
    "status.recentError": "Recent error: ",
    "status.rawError": " (raw error: ",
    "error.invalidState": "This local database was created in local-only mode and cannot enable sync in place. Delete zlog.db in the user data folder (back it up first) and restart the app.",
  },
}
let lang = "zh"
function t(key) {
  return I18N[lang][key] ?? I18N.zh[key] ?? key
}

/** 重渲染全部静态文案（data-i18n / data-i18n-placeholder）+ 动态区域。 */
function applyLang() {
  document.documentElement.lang = lang
  document.title = t(isFirstRun ? "firstrun.title" : "settings.title")
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n)
  }
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder)
  }
  if (!isFirstRun) document.getElementById("saveBtnLabel").textContent = t("save.settings")
  renderPanelMeta()
}

// ── 模式差异 ──────────────────────────────────────────────────────────
// 首启：品牌头部 + 全宽主按钮；隐藏侧栏、内容区标题、立即同步、流量分析
if (isFirstRun) {
  // 首启向导保持最小化：同步按钮、流量分析/数据面板、内容区标题全部隐藏
  document.getElementById("syncBtn").style.display = "none"
  document.getElementById("panel-analytics").style.display = "none"
  document.getElementById("panel-data").style.display = "none"
  document.getElementById("contentHeader").style.display = "none"
  document.getElementById("username").focus()
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
} else {
  document.getElementById("passwordFields").style.display = "none"
}

// ── 侧栏面板切换（设置模式） ────────────────────────────────────────
const PANEL_META = {
  sync: { titleKey: "sync.title", subtitleKey: "sync.subtitle" },
  analytics: { titleKey: "analytics.title", subtitleKey: "analytics.subtitle" },
  data: { titleKey: "data.title", subtitleKey: "data.subtitle" },
  lang: { titleKey: "lang.title", subtitleKey: "lang.subtitle" },
}
function renderPanelMeta() {
  const active = document.querySelector(".nav-item.active")
  if (!active) return
  const meta = PANEL_META[active.dataset.panel]
  document.getElementById("title2").textContent = t(meta.titleKey)
  document.getElementById("subtitle2").textContent = t(meta.subtitleKey)
}
if (!isFirstRun) {
  for (const btn of document.querySelectorAll(".nav-item")) {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b === btn))
      for (const panel of document.querySelectorAll(".panel")) {
        panel.classList.toggle("active", panel.id === `panel-${btn.dataset.panel}`)
      }
      renderPanelMeta()
    })
  }
}

// ── 语言（三态：跟随系统/中文/English） ─────────────────────────────
const langSelect = document.getElementById("langSelect")
if (langSelect) {
  zlogApi.getLang().then((state) => {
    if (!state) return
    langSelect.value = state.pref
    lang = state.resolved
    applyLang()
  })
  langSelect.addEventListener("change", async () => {
    const res = await zlogApi.setLang(langSelect.value)
    if (res && res.ok && res.state) {
      lang = res.state.resolved
      applyLang()
    }
  })
} else {
  // 首启模式无侧栏语言面板：跟随系统语言渲染
  zlogApi.getLang().then((state) => {
    if (state) {
      lang = state.resolved
      applyLang()
    }
  })
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
    hint: () => t("error.invalidState"),
  },
]
function renderStatus(s) {
  if (!s) return
  let error = s.lastSyncError
  if (error) {
    for (const { match, hint } of SYNC_ERROR_HINTS) {
      if (match.test(error)) {
        error = `${hint()}\n${t("status.rawError")}${error}）`
        break
      }
    }
  }
  // 首启向导不显示同步面板，状态区只呈现错误（同步行无意义）
  const lines = isFirstRun
    ? [error ? `${t("status.recentError")}${error}` : ""]
    : [
        `${t("status.sync")}: ${s.configured ? t("status.configured") : t("status.notConfigured")}${s.syncing ? t("status.syncing") : ""}`,
        s.lastSyncAt ? `${t("status.lastSync")}${new Date(s.lastSyncAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")}` : t("status.neverSynced"),
        error ? `${t("status.recentError")}${error}` : "",
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
      showStatus(t("status.fillUsername"), true)
      return
    }
    if (cfg.password.length < 6 || cfg.password !== cfg.password2) {
      password.setAttribute("aria-invalid", "true")
      password2.setAttribute("aria-invalid", "true")
      password.focus()
      showStatus(t("status.passwordRule"), true)
      return
    }
  }
  // 同步 URL 格式校验：填错（如误填用户名）会让 libsql 解析 panic 崩溃。
  // 与主进程 validate.ts 保持一致（渲染层无法 import，需同步维护）
  if (cfg.syncUrl && !/^libsql:\/\//.test(cfg.syncUrl)) {
    const syncUrl = document.getElementById("syncUrl")
    syncUrl.setAttribute("aria-invalid", "true")
    syncUrl.focus()
    showStatus(t("status.syncUrlInvalid"), true)
    return
  }
  saveBtn.disabled = true
  setButtonSpinner(saveBtn, true)
  showStatus(t("status.saving"))
  try {
    const res = await zlogApi.saveConfig(cfg)
    if (res && res.ok) {
      showStatus(isFirstRun ? t("status.savedFirstRun") : t("status.saved"))
      if (!isFirstRun) {
        // 设置模式窗口保持打开：复位按钮与 spinner
        saveBtn.disabled = false
        setButtonSpinner(saveBtn, false)
        refreshStatus()
      }
    } else {
      showStatus((res && res.error) || t("status.saveFailed"), true)
      saveBtn.disabled = false
      setButtonSpinner(saveBtn, false)
    }
  } catch {
    showStatus(t("status.saveFailed"), true)
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
