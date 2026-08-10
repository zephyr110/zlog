// a11y — accessibility labels (zh/en)

import type { LocaleMessages } from "./locale-messages"

const zh = {

linkToHeading: "链接到标题",
linkTo: (title: string) => `链接到 ${title}`,
    
} as const

const en = {

linkToHeading: "Link to heading",
linkTo: (title: string) => `Link to ${title}`,
    
} as const satisfies LocaleMessages<typeof zh>

export const a11y = { zh, en }
