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
import { ChangePasswordForm } from "@/components/admin/change-password-form"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Globe, UserRound, XIcon } from "lucide-react"

type SettingsPanel = "site" | "account"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t } = useT()
  const [panel, setPanel] = useState<SettingsPanel>("site")
  // Newly generated recovery key — shown once until confirmed saved.
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null)
  const [generatingKey, setGeneratingKey] = useState(false)

  async function handleGenerateRecoveryKey() {
    setGeneratingKey(true)
    try {
      // apiFetch already redirects to login on 401, so no manual handling
      // is needed here (unlike change-password, which is exempt).
      const res = await apiFetch("/api/auth/recovery", { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setNewRecoveryKey(data.recoveryKey)
      } else {
        toast.error(data.error || t("admin.recoveryKeyGenerateFailed"))
      }
    } catch {
      toast.error(t("admin.networkError"))
    } finally {
      setGeneratingKey(false)
    }
  }

  // Closing the dialog with a fresh key still on screen: the server has
  // already replaced the old key, so warn (the plaintext is shown only
  // once — it will be gone) and clear it to keep the once-only guarantee.
  function handleOpenChange(next: boolean) {
    if (!next && newRecoveryKey) {
      toast.warning(t("admin.recoveryKeyCloseWarning"))
      setNewRecoveryKey(null)
    }
    if (!next) setPanel("site")
    onOpenChange(next)
  }

  function selectPanel(next: SettingsPanel) {
    if (next !== "account" && newRecoveryKey) {
      toast.warning(t("admin.recoveryKeyOnceOnly"))
      return
    }
    setPanel(next)
  }

  const nav = [
    { id: "site" as const, label: t("admin.settingsNavSite"), icon: Globe },
    { id: "account" as const, label: t("admin.settingsNavAccount"), icon: UserRound },
  ]

  const title =
    panel === "site" ? t("admin.siteInfo") : t("admin.accountInfo")
  const description =
    panel === "site" ? t("admin.siteInfoDesc") : t("admin.settingsAccountDesc")

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
              <Button
                key={item.id}
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
                    {newRecoveryKey ? (
                      <div className="space-y-3">
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                          {t("admin.recoveryKeyOnceOnly")}
                        </p>
                        <div className="rounded-lg border bg-muted/50 px-3 py-2.5">
                          <p className="select-all break-all text-center font-mono text-sm font-semibold tracking-[0.12em]">
                            {newRecoveryKey}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard
                                .writeText(newRecoveryKey)
                                .then(() =>
                                  toast.success(t("admin.keyCopied"))
                                )
                                .catch(() =>
                                  toast.error(t("admin.copyFailed"))
                                )
                            }}
                          >
                            {t("admin.copyRecoveryKey")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setNewRecoveryKey(null)}
                          >
                            {t("admin.recoveryKeySaved")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {t("admin.recoveryKey")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("admin.recoveryKeyHint")}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={generatingKey}
                          onClick={handleGenerateRecoveryKey}
                        >
                          {generatingKey
                            ? t("admin.generatingKey")
                            : t("admin.generateRecoveryKey")}
                        </Button>
                      </div>
                    )}
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
