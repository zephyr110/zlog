"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { isDesktopBuild } from "@/lib/desktop"
import {
  DESKTOP_NAV_PATHS,
  confirmDesktopNavigation,
  isDesktopNavCommand,
} from "@/lib/desktop-commands"
import { useT } from "@/components/layout/trans"

declare global {
  interface Window {
    /** 根壳已挂载：主进程据此判断命令是否有人处理，未处理才整页跳转。 */
    __zlogDesktopShell?: boolean
    /** 编辑器有未保存修改：桌面内导航前先确认。 */
    __zlogEditorDirty?: boolean
  }
}

/** 桌面根壳：无 UI，只负责接收原生菜单命令并做站内路由跳转。
 *  Web 构建下整体惰性，不监听事件也不设置全局标记。 */
export function DesktopShell() {
  const router = useRouter()
  const { t } = useT()

  useEffect(() => {
    if (!isDesktopBuild()) return
    window.__zlogDesktopShell = true

    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<unknown>).detail
      if (!isDesktopNavCommand(command)) return
      if (!confirmDesktopNavigation(t("site.desktopLeaveUnsaved"))) return
      router.push(DESKTOP_NAV_PATHS[command])
    }

    window.addEventListener("zlog-desktop-command", onCommand)
    return () => {
      window.removeEventListener("zlog-desktop-command", onCommand)
      window.__zlogDesktopShell = false
    }
  }, [router, t])

  return null
}
