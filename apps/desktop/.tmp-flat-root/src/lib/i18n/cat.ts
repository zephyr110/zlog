// cat — zh/en translation dictionary (split by domain)

import type { LocaleMessages } from "./locale-messages"

const zh = {

frontend: "前端",
backend: "后端",
automator: "自动化",
components: "组件",
gear: "工具",
miniprogram: "小程序",
summary: "总结",
    
} as const

const en = {

frontend: "Frontend",
backend: "Backend",
automator: "Automation",
components: "Components",
gear: "Tools",
miniprogram: "Mini Program",
summary: "Summary",
    
} as const satisfies LocaleMessages<typeof zh>

export const cat = { zh, en }
