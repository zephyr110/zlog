"use client"

import { useEffect, useState } from "react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RecoveryKeyPanel } from "@/components/admin/recovery-key-panel"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  Cloud,
  KeyRound,
  X,
} from "lucide-react"

const DISMISS_KEY = "zlog.onboarding.dismissed"

function readDismissed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(DISMISS_KEY) === "1"
  } catch {
    return false
  }
}

interface SyncStatus {
  configured: boolean
  lastSyncError?: string | null
}

/**
 * 首次登录清单：账号（恒为完成）、恢复密钥（可操作）、云同步（仅提示）。
 * 关闭状态按 origin 记录，不影响本地写作。
 */
export function OnboardingChecklist() {
  const { t } = useT()
  const [dismissed, setDismissed] = useState(readDismissed)
  const [ready, setReady] = useState(false)
  const [recoveryConfigured, setRecoveryConfigured] = useState<boolean | null>(
    null
  )
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [hasUnsavedKey, setHasUnsavedKey] = useState(false)

  useEffect(() => {
    if (dismissed) return
    let cancelled = false

    void (async () => {
      const [recoveryRes, syncRes] = await Promise.all([
        apiFetch("/api/auth/recovery").catch(() => null),
        fetch("/api/sync/status").catch(() => null),
      ])
      if (cancelled) return

      if (recoveryRes?.ok) {
        const data = await recoveryRes.json().catch(() => null)
        if (!cancelled) {
          setRecoveryConfigured(
            typeof data?.configured === "boolean" ? data.configured : null
          )
        }
      }
      if (syncRes?.ok) {
        const data = await syncRes.json().catch(() => null)
        if (!cancelled && typeof data?.configured === "boolean") {
          setSync(data as SyncStatus)
        }
      }
      if (!cancelled) setReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [dismissed])

  function handleDismiss() {
    if (hasUnsavedKey) {
      toast.warning(t("admin.recoveryKeyOnceOnly"))
      return
    }
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // 写入失败也只在本次会话内隐藏
    }
  }

  if (!ready || dismissed) return null

  const allDone = recoveryConfigured === true
  const syncConfigured = sync?.configured === true
  const syncError = syncConfigured && !!sync?.lastSyncError

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {allDone
            ? t("admin.onboardingDoneTitle")
            : t("admin.onboardingTitle")}
        </CardTitle>
        <CardDescription>
          {allDone
            ? t("admin.onboardingDoneDesc")
            : t("admin.onboardingDesc")}
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("admin.onboardingDismiss")}
            onClick={handleDismiss}
          >
            <X />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border rounded-lg border">
          <li className="flex items-start gap-3 px-4 py-3">
            <CheckCircle2
              className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {t("admin.onboardingAccount")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("admin.onboardingAccountDone")}
              </p>
            </div>
          </li>

          <li className="flex items-start gap-3 px-4 py-3">
            {recoveryConfigured === true ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            ) : (
              <KeyRound
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {t("admin.onboardingRecovery")}
              </p>
              {recoveryConfigured === null ? (
                <p className="text-xs text-muted-foreground">
                  {ready
                    ? t("admin.onboardingRecoveryUnknown")
                    : t("admin.onboardingChecking")}
                </p>
              ) : recoveryConfigured ? (
                <p className="text-xs text-muted-foreground">
                  {t("admin.onboardingRecoveryDone")}
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.onboardingRecoveryMissing")}
                  </p>
                  {!recoveryOpen && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => setRecoveryOpen(true)}
                    >
                      {t("admin.generateRecoveryKey")}
                    </Button>
                  )}
                </>
              )}
              {recoveryOpen && (
                <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                  <RecoveryKeyPanel
                    showHeading={false}
                    onGenerated={() => {
                      setRecoveryConfigured(true)
                      setHasUnsavedKey(true)
                    }}
                    onSaved={() => {
                      setHasUnsavedKey(false)
                      setRecoveryOpen(false)
                    }}
                  />
                </div>
              )}
            </div>
          </li>

          <li className="flex items-start gap-3 px-4 py-3">
            {syncError ? (
              <CircleAlert
                className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
            ) : syncConfigured ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            ) : sync === null ? (
              <Circle
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            ) : (
              <Cloud
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">
                  {t("admin.onboardingSync")}
                </p>
                {!syncConfigured && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {t("admin.onboardingSyncOptional")}
                  </span>
                )}
              </div>
              {sync === null ? (
                <p className="text-xs text-muted-foreground">
                  {t("admin.onboardingSyncUnknown")}
                </p>
              ) : syncError ? (
                <p className="text-xs text-muted-foreground">
                  {t("admin.onboardingSyncError")}
                </p>
              ) : syncConfigured ? (
                <p className="text-xs text-muted-foreground">
                  {t("admin.onboardingSyncDone")}
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.onboardingSyncMissing")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("admin.onboardingSyncHint")}
                  </p>
                </>
              )}
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}
