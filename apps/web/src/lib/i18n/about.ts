// about — zh/en translation dictionary (split by domain)

import type { LocaleMessages } from "./locale-messages"

const zh = {

title: "关于",
description: "关于这个博客及其作者的故事。",
aboutMe: "关于我",
aboutMeContent:
  "你好！我是这个博客的作者。我写技术、编程和任何我感兴趣的内容。这个博客是我分享想法、记录学习和与志同道合的人交流的空间。",
aboutMeContent2:
  "当我不写作时，你可能会发现我在探索新技术、参与开源项目或享受一杯好咖啡。",
techStack: "技术栈",
techStackDesc: "这个博客使用现代工具构建，旨在快速且易于维护。",
contact: "联系方式",
contactDesc:
  "有问题、建议或只是想打个招呼？随时联系。我始终欢迎有趣的对话和合作。",
github: "GitHub",
twitter: "X (Twitter)",
rendered: "静态站点生成",
components: "美观、可访问的 UI 组件",
styling: "实用优先的响应式样式",
content: "通过 Markdown + JSX 编写丰富内容",
database: "边缘分布式 SQLite 数据库",
hosting: "全球边缘网络部署",
cicd: "Git 推送自动构建部署",
    
} as const

const en = {

title: "About",
description:
  "The story behind this blog and the technology that powers it.",
aboutMe: "About Me",
aboutMeContent:
  "Hi! I'm the author of this blog. I write about technology, programming, and whatever else catches my interest. This blog is my space to share thoughts, document learnings, and connect with others who share similar interests.",
aboutMeContent2:
  "When I'm not writing, you can find me exploring new technologies, contributing to open-source projects, or enjoying a good cup of coffee.",
techStack: "Tech Stack",
techStackDesc:
  "This blog is built with modern tools, designed to be fast and maintainable.",
contact: "Contact",
contactDesc:
  "Have a question, suggestion, or just want to say hi? Feel free to reach out. I'm always open to interesting conversations and collaborations.",
github: "GitHub",
twitter: "X (Twitter)",
rendered: "Static site generation with App Router",
components: "Beautiful, accessible UI components",
styling: "Utility-first responsive styling",
content: "Rich content with Markdown + JSX",
database: "Edge-distributed SQLite database",
hosting: "Global edge network deployment",
cicd: "Automated build and deploy on push",
    
} as const satisfies LocaleMessages<typeof zh>

export const about = { zh, en }
