"use client"

import { useState } from "react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SiteInfoForm } from "@/components/admin/site-info-form"
import { AppearanceForm } from "@/components/admin/appearance-form"
import { ChangePasswordForm } from "@/components/admin/change-password-form"
import { RecoveryKeyPanel } from "@/components/admin/recovery-key-panel"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Globe, Palette, UserRound, XIcon } from "lucide-react"

type SettingsPanel = "site" | "appearance" | "account"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t } = useT()
  const [panel, setPanel] = useState<SettingsPanel>("site")
  // 新密钥在确认保存前保持可见；明文归面板所有，弹窗只需要知道能否关闭。
  const [hasUnsavedKey, setHasUnsavedKey] = useState(false)

  // 带未保存密钥关闭：服务端已替换旧密钥，明文只显示一次，提醒后随弹窗卸载丢弃。
  function handleOpenChange(next: boolean) {
    if (!next && hasUnsavedKey) {
      toast.warning(t("admin.recoveryKeyCloseWarning"))
      setHasUnsavedKey(false)
    }
    if (!next) setPanel("site")
    onOpenChange(next)
  }

  function selectPanel(next: SettingsPanel) {
    if (next !== "account" && hasUnsavedKey) {
      toast.warning(t("admin.recoveryKeyOnceOnly"))
      return
    }
    setPanel(next)
  }

  const nav = [
    { id: "account" as const, label: t("admin.settingsNavAccount"), icon: UserRound },
    { id: "site" as const, label: t("admin.settingsNavSite"), icon: Globe },
    { id: "appearance" as const, label: t("admin.settingsNavAppearance"), icon: Palette },
  ]

  const title =
    panel === "site"
      ? t("admin.siteInfo")
      : panel === "appearance"
        ? t("admin.appearanceInfo")
        : t("admin.accountInfo")
  const description =
    panel === "site"
      ? t("admin.siteInfoDesc")
      : panel === "appearance"
        ? t("admin.appearanceInfoDesc")
        : t("admin.settingsAccountDesc")

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(calc(100dvh-2rem),40rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:flex-row"
      >
        <nav
          className="flex shrink-0 flex-row gap-0.5 overflow-x-auto border-b bg-muted/40 p-2 sm:w-44 sm:flex-col sm:overflow-visible sm:border-r sm:border-b-0 sm:px-3 sm:pt-4 sm:pb-3"
          aria-label={t("admin.settings")}
        >
          {nav.map((item) => {
            const Icon = item.icon
            const active = panel === item.id
            return (
              <div key={item.id} className="flex shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-current={active ? "page" : undefined}
                  onClick={() => selectPanel(item.id)}
                  className={cn(
                    "h-8 shrink-0 justify-start px-2.5 text-sm sm:w-full",
                    active
                      ? "bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <Icon
                    className={cn("size-4", !active && "opacity-70")}
                  />
                  {item.label}
                </Button>
              </div>
            )
          })}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DialogHeader className="relative shrink-0 gap-1 border-b px-6 py-4 pr-12">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-3 right-3"
                />
              }
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogClose>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 [scrollbar-gutter:stable]">
            {open ? (
              <>
                {/* h-full 高度链：加载时 spinner 在右侧内容区水平垂直居中 */}
                <div hidden={panel !== "site"} className="h-full">
                  <SiteInfoForm idPrefix="dlg-site" className="h-full" />
                </div>
                <div hidden={panel !== "appearance"} className="h-full">
                  <AppearanceForm className="h-full" />
                </div>
                <div hidden={panel !== "account"} className="max-w-sm space-y-5">
                  <section>
                    <ChangePasswordForm
                      idPrefix="dlg-pw"
                      wrongPasswordKey="admin.currentPasswordWrong"
                      onSuccess={() => handleOpenChange(false)}
                    />
                  </section>
                  <Separator />
                  <section>
                    <RecoveryKeyPanel
                      onGenerated={() => setHasUnsavedKey(true)}
                      onSaved={() => setHasUnsavedKey(false)}
                    />
                  </section>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
