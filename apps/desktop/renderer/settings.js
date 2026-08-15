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
    "nav.publish": "发布到线上",
    "nav.about": "关于",
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
    "tag.required": "（必填）",
    "tag.optional": "（可选）",
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
    "analytics.vercelTitle": "Vercel Analytics",
    "analytics.vercelToken": "API Token",
    "analytics.vercelTokenPh": "Vercel 控制台 → Settings → Tokens",
    "analytics.vercelProjectId": "Project ID",
    "analytics.vercelProjectIdPh": "项目 Settings → General 页面底部",
    "analytics.vercelTeamId": "Team ID",
    "analytics.vercelTeamIdNote": "（团队项目才需要）",
    "analytics.vercelTeamIdPh": "留空表示个人项目",
    "analytics.gaTitle": "Google Analytics 4",
    "analytics.gaId": "媒体资源 ID",
    "analytics.gaEmail": "服务账号邮箱",
    "analytics.gaKey": "服务账号私钥",
    "analytics.hint": "服务账号需在该媒体资源中授予「查看者」权限；详细步骤见 README 的部署章节",
    "analytics.proxyTitle": "网络代理",
    "analytics.proxyPh": "http:// 或 socks5://主机:端口",
    "analytics.proxyHint": "用于拉取 Vercel Analytics 与 Google Analytics 4。留空则自动读取系统/VPN 的 HTTP 或 SOCKS 代理。SOCKS 端口请填 socks5://，不要写成 http://。",
    "data.location": "位置",
    "data.backupHint": "本地数据库、配置与日志。备份该目录即备份整个博客",
    "data.open": "打开",
    "lang.label": "界面语言",
    "lang.system": "跟随系统",
    "lang.zh": "中文",
    "lang.en": "English",
    "lang.hint": "跟随系统时，系统语言为中文则显示中文；其他语言一律显示英文",
    "publish.title": "发布到线上",
    "publish.subtitle": "让文章在 web 上可访问",
    "publish.intro": "完成下面三个步骤后，任何人通过网址就能访问你的文章",
    "publish.step1": "创建 Turso 数据库（文章数据存储）",
    "publish.step1Link": "打开 turso.tech",
    "publish.step2": "把博客部署到 Vercel（一次性；含环境变量清单）",
    "publish.step2Link": "部署指南",
    "publish.step3": "回到「同步设置」，填入数据库 URL 和 Token",
    "publish.done": "之后发布文章会自动同步到线上，约 1 分钟内可见",
    "about.title": "关于",
    "about.subtitle": "版本信息与项目链接",
    "about.version": "版本",
    "about.checkUpdate": "检查更新",
    "about.checking": "检查中…",
    "about.upToDate": "已是最新版本",
    "about.found": "发现新版本",
    "about.download": "下载",
    "about.downloading": "下载中",
    "about.downloaded": "下载完成",
    "about.openPackage": "打开安装包",
    "about.checkFailed": "检查更新失败，请检查网络后重试",
    "about.downloadFailed": "下载失败，请重试",
    "about.noAsset": "当前平台暂无对应安装包",
    "about.repository": "代码仓库",
    "about.license": "开源协议",
    "about.checkHint": "自动检查 GitHub Releases 最新版本",
    "save.firstRun": "保存并启动",
    "save.settings": "保存",
    "sync.now": "立即同步",
    "secret.show": "显示",
    "secret.hide": "隐藏",
    "status.saving": "保存中…",
    "status.saved": "已保存",
    "status.savedFirstRun": "已保存，博客即将打开。",
    "status.saveFailed": "保存失败，请重试。",
    "status.fillUsername": "请填写用户名。",
    "status.passwordRule": "密码至少 6 位，且两次输入一致。",
    "status.syncUrlInvalid": "数据库 URL 需以 libsql:// 开头，如 libsql://your-db.turso.io",
    "status.httpsProxyInvalid": "代理格式应为 http://主机:端口 或 socks5://主机:端口",
    "status.sync": "同步",
    "status.configured": "已配置",
    "status.notConfigured": "未配置",
    "status.syncing": "（同步中…）",
    "status.lastSync": "上次同步：",
    "status.neverSynced": "尚未同步",
    "status.recentError": "最近错误：",
    "status.rawError": "（原始错误：",
    "status.rawErrorClose": "）",
    "error.invalidState": "本地数据库由纯本地模式创建，无法原地启用同步。请删除用户数据目录中的 zlog.db（先备份）后重启应用。",
  },
  en: {
    "nav.sync": "Sync",
    "nav.analytics": "Analytics",
    "nav.data": "Data Folder",
    "nav.lang": "Language",
    "nav.publish": "Go Live",
    "nav.about": "About",
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
    "tag.required": " (required)",
    "tag.optional": " (optional)",
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
    "analytics.vercelTitle": "Vercel Analytics",
    "analytics.vercelToken": "API Token",
    "analytics.vercelTokenPh": "Vercel console → Settings → Tokens",
    "analytics.vercelProjectId": "Project ID",
    "analytics.vercelProjectIdPh": "Bottom of project Settings → General",
    "analytics.vercelTeamId": "Team ID",
    "analytics.vercelTeamIdNote": " (teams only)",
    "analytics.vercelTeamIdPh": "Leave empty for personal projects",
    "analytics.gaTitle": "Google Analytics 4",
    "analytics.gaId": "Property ID",
    "analytics.gaEmail": "Service account email",
    "analytics.gaKey": "Service account private key",
    "analytics.hint": "Grant the service account Viewer access on this property; see the README deployment section for steps",
    "analytics.proxyTitle": "Proxy",
    "analytics.proxyPh": "http:// or socks5://host:port",
    "analytics.proxyHint": "Used to fetch Vercel Analytics and Google Analytics 4. Leave empty to read the system/VPN HTTP or SOCKS proxy. Use socks5:// for a SOCKS port; do not write it as http://.",
    "data.location": "Location",
    "data.backupHint": "Local database, config, and logs. Back up this folder to back up the whole blog",
    "data.open": "Open",
    "lang.label": "Interface Language",
    "lang.system": "Follow System",
    "lang.zh": "中文",
    "lang.en": "English",
    "lang.hint": "With \"Follow System\", Chinese system languages show Chinese; anything else shows English",
    "publish.title": "Publish Online",
    "publish.subtitle": "Make your posts accessible on the web",
    "publish.intro": "Complete these three steps and anyone can visit your posts via a URL",
    "publish.step1": "Create a Turso database (post storage)",
    "publish.step1Link": "Open turso.tech",
    "publish.step2": "Deploy the blog to Vercel (one-time; includes the env var checklist)",
    "publish.step2Link": "Deployment guide",
    "publish.step3": "Back in Sync, paste the database URL and token",
    "publish.done": "Posts you publish sync automatically and go live within ~1 minute",
    "about.title": "About",
    "about.subtitle": "Version info and project links",
    "about.version": "Version",
    "about.checkUpdate": "Check for Updates",
    "about.checking": "Checking…",
    "about.upToDate": "You're up to date",
    "about.found": "New version available",
    "about.download": "Download",
    "about.downloading": "Downloading",
    "about.downloaded": "Download complete",
    "about.openPackage": "Open Installer",
    "about.checkFailed": "Update check failed — check your network and retry",
    "about.downloadFailed": "Download failed, please retry",
    "about.noAsset": "No installer for this platform yet",
    "about.repository": "Repository",
    "about.license": "License",
    "about.checkHint": "Automatically checks the latest GitHub Release",
    "save.firstRun": "Save & Start",
    "save.settings": "Save",
    "sync.now": "Sync Now",
    "secret.show": "Show",
    "secret.hide": "Hide",
    "status.saving": "Saving…",
    "status.saved": "Saved",
    "status.savedFirstRun": "Saved — your blog is about to open.",
    "status.saveFailed": "Save failed, please retry.",
    "status.fillUsername": "Please enter a username.",
    "status.passwordRule": "Password must be at least 6 characters and match the confirmation.",
    "status.syncUrlInvalid": "Database URL must start with libsql://, e.g. libsql://your-db.turso.io",
    "status.httpsProxyInvalid": "Proxy must look like http://host:port or socks5://host:port",
    "status.sync": "Sync",
    "status.configured": "Configured",
    "status.notConfigured": "Not configured",
    "status.syncing": " (syncing…)",
    "status.lastSync": "Last sync: ",
    "status.neverSynced": "Never synced",
    "status.recentError": "Recent error: ",
    "status.rawError": " (raw error: ",
    "status.rawErrorClose": ")",
    "error.invalidState": "This local database was created in local-only mode and cannot enable sync in place. Delete zlog.db in the user data folder (back it up first) and restart the app.",
  },
}
let lang = "zh"
// 最近一次同步状态（applyLang 重渲染状态区时复用，保证语言切换后
// 动态文案也跟随；refreshStatus 是唯一写者）
let lastStatus = null
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
  // 动态状态区同样跟随语言（缓存的最近一次同步状态重渲染）
  if (lastStatus) renderStatus(lastStatus)
  // 关于面板的更新状态是 JS 维护的动态文案（不带 data-i18n）：
  // 语言切换后按当前状态机重渲染，按钮/状态不回到初始值。
  // 直接调用：renderUpdateState 内部自行 getElementById，不能引用
  // 文件后段声明的 updateBtn（TDZ——applyLang 先于 about 区块执行）
  renderUpdateState()
  // 语言 select 的显示值跟随字典（内部取元素，避免 TDZ）
  const langValue = document.getElementById("langSelectValue")
  if (langValue) langValue.textContent = t(`lang.${currentPref}`)
  const popup = document.getElementById("langPopup")
  if (popup) {
    for (const item of popup.querySelectorAll(".select-item")) {
      item.classList.toggle("selected", item.dataset.value === currentPref)
    }
  }
  for (const btn of document.querySelectorAll(".secret-toggle")) syncSecretToggle(btn)
}

/** 密钥框 eye：按当前 type 同步图标与 aria-label（不走 data-i18n，以免清掉 SVG）。 */
function syncSecretToggle(btn) {
  const input = document.getElementById(btn.getAttribute("aria-controls"))
  if (!input) return
  const shown = input.type === "text"
  btn.setAttribute("aria-pressed", String(shown))
  btn.setAttribute("aria-label", t(shown ? "secret.hide" : "secret.show"))
}

// ── 语言 select 与关于面板状态（声明先于 applyLang：语言初始化会在
// 本文件后段逻辑执行前调用 applyLang，const 声明若在后面会触发 TDZ）──
let currentPref = "system" // 语言偏好（select 显示值；applyLang 渲染用）
let updateInfo = null // 最近一次检查结果（含 downloadUrl）
let updateChecked = false // 本窗口会话是否已自动检查过（失败也算一次）
let updateBusy = false // 检查/下载进行中（按钮禁用）
let updateDest = null // 下载完成后的本地路径
let updateUiState = "idle" // 派生 UI 状态（renderUpdateState 的唯一输入）
let updatePercent = 0 // 下载进度（downloading 状态用）

function renderUpdateState() {
  const updateBtn = document.getElementById("updateBtn")
  const updateStatus = document.getElementById("updateStatus")
  const latest = updateInfo?.latest
  switch (updateUiState) {
    case "checking":
      updateBtn.textContent = t("about.checkUpdate")
      updateBtn.disabled = true
      updateStatus.textContent = t("about.checking")
      updateStatus.classList.remove("error")
      break
    case "upToDate":
      updateBtn.textContent = t("about.checkUpdate")
      updateBtn.disabled = false
      updateStatus.textContent = `${t("about.upToDate")} ${updateInfo?.current ?? ""}`
      updateStatus.classList.remove("error")
      break
    case "found":
      updateBtn.textContent = `${t("about.download")} v${latest}`
      updateBtn.disabled = false
      updateStatus.textContent = `${t("about.found")} v${latest}`
      updateStatus.classList.remove("error")
      break
    case "noAsset":
      updateBtn.textContent = t("about.checkUpdate")
      updateBtn.disabled = false
      updateStatus.textContent = `${t("about.found")} v${latest} — ${t("about.noAsset")}`
      updateStatus.classList.add("error")
      break
    case "downloading":
      updateBtn.disabled = true
      updateStatus.textContent = `${t("about.downloading")} ${updatePercent}%`
      updateStatus.classList.remove("error")
      break
    case "downloaded":
      updateBtn.textContent = t("about.openPackage")
      updateBtn.disabled = false
      updateStatus.textContent = `${t("about.downloaded")} v${latest}`
      updateStatus.classList.remove("error")
      break
    case "checkFailed":
      updateBtn.textContent = t("about.checkUpdate")
      updateBtn.disabled = false
      updateStatus.textContent = t("about.checkFailed")
      updateStatus.classList.add("error")
      break
    case "downloadFailed":
      updateBtn.textContent = `${t("about.download")} v${latest}`
      updateBtn.disabled = false
      updateStatus.textContent = t("about.downloadFailed")
      updateStatus.classList.add("error")
      break
    default:
      updateBtn.textContent = t("about.checkUpdate")
      updateBtn.disabled = false
      updateStatus.textContent = t("about.checkHint")
      updateStatus.classList.remove("error")
  }
}

// ── 模式差异 ──────────────────────────────────────────────────────────
// 首启：品牌头部 + 全宽主按钮。侧栏由 body.mode-firstrun 的 CSS 隐藏；
// JS 再藏掉同步按钮、流量/数据/语言/关于面板和内容区标题。
if (isFirstRun) {
  // 首启向导保持最小化：只留账号 + 可选同步
  document.getElementById("syncBtn").style.display = "none"
  document.getElementById("panel-analytics").style.display = "none"
  document.getElementById("panel-data").style.display = "none"
  document.getElementById("panel-lang").style.display = "none"
  document.getElementById("panel-publish").style.display = "none"
  document.getElementById("panel-about").style.display = "none"
  document.getElementById("contentHeader").style.display = "none"
  document.getElementById("username").focus()
} else {
  document.getElementById("passwordFields").style.display = "none"
  // 预填已保存的配置（C1：表单必须回显存量值，否则空字段会被当
  // 成"清空"保存，静默抹掉流量分析凭据）。密码类字段同样回显，
  // 用户清空即表示删除。
  // 无 preload（浏览器直接打开 HTML）时不能抛：后面还要绑侧栏点击。
  zlogApi?.loadConfig?.()?.then((cfg) => {
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
    set("httpsProxy", cfg.httpsProxy)
  })
}

// ── 侧栏面板切换（设置模式） ────────────────────────────────────────
const PANEL_META = {
  sync: { titleKey: "sync.title", subtitleKey: "sync.subtitle" },
  analytics: { titleKey: "analytics.title", subtitleKey: "analytics.subtitle" },
  data: { titleKey: "data.title", subtitleKey: "data.subtitle" },
  lang: { titleKey: "lang.title", subtitleKey: "lang.subtitle" },
  publish: { titleKey: "publish.title", subtitleKey: "publish.subtitle" },
  about: { titleKey: "about.title", subtitleKey: "about.subtitle" },
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
      // 打开关于面板时自动检查一次（本窗口会话仅一次）
      if (btn.dataset.panel === "about" && !updateChecked) void checkForUpdates()
    })
  }
}

// ── 语言（三态：跟随系统/中文/English，shadcn 风格自定义 select） ──
// 首启模式下语言面板被隐藏但元素在 DOM：首启跟随系统语言渲染。
// 先同步渲染一次 zh 默认，避免 IPC 往返期间窗口停留在 HTML 初值。
applyLang()
for (const btn of document.querySelectorAll(".secret-toggle")) {
  btn.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    const input = document.getElementById(btn.getAttribute("aria-controls"))
    if (!input) return
    input.type = input.type === "password" ? "text" : "password"
    syncSecretToggle(btn)
  })
}
const langSelectBtn = document.getElementById("langSelectBtn")
const langPopup = document.getElementById("langPopup")

function setLangPopupOpen(open) {
  langSelectBtn.setAttribute("aria-expanded", String(open))
  langPopup.hidden = !open
}

langSelectBtn.addEventListener("click", (e) => {
  e.stopPropagation()
  setLangPopupOpen(langPopup.hidden)
})
// 点击外部关闭（popup 挂在 body 事件上：trigger 的 stopPropagation
// 保证点 trigger 自身时不会立即关闭）
document.addEventListener("click", () => setLangPopupOpen(false))
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setLangPopupOpen(false)
})
for (const item of langPopup.querySelectorAll(".select-item")) {
  item.addEventListener("click", async (e) => {
    e.stopPropagation()
    const pref = item.dataset.value
    const res = await zlogApi?.setLang?.(pref)
    if (res && res.ok && res.state) {
      currentPref = pref
      lang = res.state.resolved
      applyLang()
    }
    setLangPopupOpen(false)
  })
}

zlogApi?.getLang?.()?.then((state) => {
    if (!state) return
    currentPref = state.pref
    lang = state.resolved
    applyLang()
  })?.catch(() => {
    // IPC 失败（如语言文件目录不可写）：保持 zh 默认，静态渲染已由
    // 上方的同步 applyLang() 完成
  })

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
  lastStatus = s
  let error = s.lastSyncError
  if (error) {
    for (const { match, hint } of SYNC_ERROR_HINTS) {
      if (match.test(error)) {
        error = `${hint()}\n${t("status.rawError")}${error}${t("status.rawErrorClose")}`
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
  if (!zlogApi?.getSyncStatus) return
  renderStatus(await zlogApi.getSyncStatus())
}

function isValidHttpProxy(raw) {
  if (!raw) return false
  try {
    const prefixed = /^(https?|socks5h?|socks4a?|socks):\/\//i.test(raw) ? raw : `http://${raw}`
    const url = new URL(prefixed)
    const hostPart = raw.replace(/^(https?|socks5h?|socks4a?|socks):\/\//i, "").split("/")[0] || ""
    const host = hostPart.startsWith("[")
      ? hostPart
      : hostPart.includes("@")
        ? hostPart.slice(hostPart.lastIndexOf("@") + 1)
        : hostPart
    const hasPort = host.startsWith("[") ? /\]:\d+$/.test(host) : /:\d+$/.test(host)
    const proto = url.protocol
    const okProto =
      proto === "http:" ||
      proto === "https:" ||
      proto === "socks:" ||
      proto === "socks5:" ||
      proto === "socks5h:"
    return okProto && !!url.hostname && hasPort
  } catch {
    return false
  }
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
    httpsProxy: document.getElementById("httpsProxy").value.trim(),
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
  const httpsProxyEl = document.getElementById("httpsProxy")
  httpsProxyEl.removeAttribute("aria-invalid")
  if (cfg.httpsProxy && !isValidHttpProxy(cfg.httpsProxy)) {
    httpsProxyEl.setAttribute("aria-invalid", "true")
    httpsProxyEl.focus()
    showStatus(t("status.httpsProxyInvalid"), true)
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
  "gaPropertyId", "gaClientEmail", "gaPrivateKey", "httpsProxy",
]) {
  const el = document.getElementById(id)
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSave()
  })
}

// ── 关于：版本 + 更新检查 ──────────────────────────────────────────
// 状态机：idle → checking → up-to-date | update-available
//   → downloading → downloaded →（手动确认）opening
// 状态声明与 renderUpdateState 在文件上部（applyLang 之前）；这里只剩
// 元素引用与交互逻辑。所有 UI 文案经 renderUpdateState() 集中渲染，
// 语言切换（applyLang）或进度事件后调用，动态状态不因 data-i18n 重写丢失。
const appVersionEl = document.getElementById("appVersion")
const updateBtn = document.getElementById("updateBtn")

async function checkForUpdates() {
  if (updateBusy) return
  updateBusy = true
  updateUiState = "checking"
  renderUpdateState()
  const res = await zlogApi.checkForUpdates().catch(() => null)
  updateBusy = false
  updateChecked = true // 失败也算检查过：避免每次切回面板都重发请求
  if (!res || !res.ok) {
    updateUiState = "checkFailed"
    renderUpdateState()
    return
  }
  updateInfo = res
  if (!res.hasUpdate) {
    updateUiState = "upToDate"
    renderUpdateState()
    return
  }
  if (!res.downloadUrl) {
    updateUiState = "noAsset"
    renderUpdateState()
    return
  }
  updateUiState = "found"
  renderUpdateState()
}

async function downloadUpdatePackage() {
  if (updateBusy || !updateInfo?.downloadUrl) return
  updateBusy = true
  updatePercent = 0
  updateUiState = "downloading"
  renderUpdateState()
  const res = await zlogApi.downloadUpdate(updateInfo.downloadUrl).catch(() => null)
  updateBusy = false
  if (!res || !res.ok) {
    updateUiState = "downloadFailed"
    renderUpdateState()
    return
  }
  updateDest = res.dest
  updateUiState = "downloaded"
  renderUpdateState()
}

// 主进程流式下载进度（百分比文本）
zlogApi?.onUpdateProgress?.(({ percent }) => {
  updatePercent = percent
  if (updateUiState === "downloading") renderUpdateState()
})

updateBtn.addEventListener("click", () => {
  if (updateBtn.disabled) return
  if (updateDest) {
    void zlogApi.openUpdate(updateDest)
  } else if (updateInfo?.hasUpdate && updateInfo.downloadUrl) {
    void downloadUpdatePackage()
  } else {
    void checkForUpdates()
  }
})

// 版本号常驻显示（无需网络）
zlogApi?.getVersion?.()?.then((v) => {
    if (v) appVersionEl.textContent = /^v/i.test(v) ? v : `v${v}`
  })?.catch(() => {
    // IPC 失败时保留占位符（…），不产生未处理的 rejection
  })

// ── 其他操作 ──────────────────────────────────────────────────────────
document.getElementById("syncBtn").addEventListener("click", async () => {
  await zlogApi.runSyncNow()
  refreshStatus()
})
document.getElementById("openBtn2")?.addEventListener("click", () => {
  zlogApi.openDataDir()
})

refreshStatus()
