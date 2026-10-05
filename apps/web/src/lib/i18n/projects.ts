// projects — zh/en translation dictionary (public Projects page)

import type { LocaleMessages } from "./locale-messages"

const zh = {
  title: "项目",
  description: "我构建和维护的一些东西。",
  empty: "暂无项目",
  emptyHint: "项目整理中，敬请期待。",
  repo: "查看仓库",
  demo: "在线演示",
} as const

const en = {
  title: "Projects",
  description: "Things I build and maintain.",
  empty: "No projects yet",
  emptyHint: "Projects are being organized — check back soon.",
  repo: "View repo",
  demo: "Live demo",
} as const satisfies LocaleMessages<typeof zh>

export const projects = { zh, en }
