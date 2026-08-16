// category — zh/en translation dictionary (split by domain)

import type { LocaleMessages } from "./locale-messages"

const zh = {

empty: "暂无文章",
emptyDesc: "该分类下还没有文章。",
tagsCount: (n: number) => `${n} 个标签`,
tagsLabel: "标签：",
    
} as const

const en = {

empty: "No articles yet",
emptyDesc: "There are no articles in this category.",
tagsCount: (n: number) => `${n} tags`,
tagsLabel: "Tags:",
    
} as const satisfies LocaleMessages<typeof zh>

export const category = { zh, en }
