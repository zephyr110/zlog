// archive — zh/en translation dictionary (split by domain)

import type { LocaleMessages } from "./locale-messages"

const zh = {

title: "归档",
description: "全部文章，按年份分组。",
total: (n: number) => `共 ${n} 篇文章`,

} as const

const en = {

title: "Archive",
description: "Every article, grouped by year.",
total: (n: number) => `${n} ${n === 1 ? "article" : "articles"} in total`,

} as const satisfies LocaleMessages<typeof zh>

export const archive = { zh, en }
