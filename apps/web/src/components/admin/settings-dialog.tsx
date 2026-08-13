"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle, CardDescription as CardDesc } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SiteInfoForm } from "@/components/admin/site-info-form"
import { ChangePasswordForm } from "@/components/admin/change-password-form"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t } = useT()
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
        toast.error(data.error || (t("admin.recoveryKeyGenerateFailed")))
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
  function handleOpenChange(open: boolean) {
    if (!open && newRecoveryKey) {
      toast.warning(t("admin.recoveryKeyCloseWarning"))
      setNewRecoveryKey(null)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* The dialog shell never scrolls — only the body below does, so
          the header (and its close button) stays fixed while the cards
          scroll. */}
      <DialogContent className="flex max-h-[min(calc(100dvh-2rem),85vh)] max-w-3xl flex-col overflow-hidden p-5">
        <DialogHeader className="shrink-0 pr-10">
          <DialogTitle className="text-lg">{t("admin.settings")}</DialogTitle>
          <DialogDescription>
            {t("admin.settingsDesc")}
          </DialogDescription>
        </DialogHeader>

        {/* Padding rhythm: p-5 shell, gap-4 from the dialog separates the
            header, and compact sm cards (12px inner padding) at 20px
            spacing keep the card stack tight without feeling cramped.
            p-0.5 here keeps the cards' outer ring (1px box-shadow) from
            being clipped by the scroll container's edges. */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-0.5">
          {/* Change Password */}
          <Card size="sm">
            <CardHeader>
              <CardTitle className="font-semibold">{t("admin.changePassword")}</CardTitle>
              <CardDesc>
                {t("admin.changePasswordDesc")}
              </CardDesc>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm
                idPrefix="dlg-pw"
                wrongPasswordKey="admin.currentPasswordWrong"
                onSuccess={() => onOpenChange(false)}
              />
            </CardContent>
          </Card>

          {/* Recovery Key — compact: no header, the card content carries
              the label + hint and the action in one row (or the generated
              key + confirm buttons when one is showing). */}
          <Card size="sm">
            <CardContent>
              {newRecoveryKey ? (
                <div className="space-y-2.5">
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
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {t("admin.recoveryKey")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
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
                      ? (t("admin.generatingKey"))
                      : (t("admin.generateRecoveryKey"))}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Site Info */}
          <Card size="sm">
            <CardHeader>
              <CardTitle className="font-semibold">{t("admin.siteInfo")}</CardTitle>
              <CardDesc>{t("admin.siteInfoDesc")}</CardDesc>
            </CardHeader>
            <CardContent>
              {open ? (
                <SiteInfoForm idPrefix="dlg-site" className="space-y-4" />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
