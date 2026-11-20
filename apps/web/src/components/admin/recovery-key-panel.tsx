"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface RecoveryKeyPanelProps {
  className?: string
  /** 父级已提供标题时隐藏内建标题。 */
  showHeading?: boolean
  /** 新明文出现时回调（服务端此时已替换旧密钥）。 */
  onGenerated?: () => void
  /** 用户确认已保存后回调。 */
  onSaved?: () => void
}

/** 生成一次性恢复密钥：明文只存在本地状态，用户确认保存后即丢弃。 */
export function RecoveryKeyPanel({
  className,
  showHeading = true,
  onGenerated,
  onSaved,
}: RecoveryKeyPanelProps) {
  const { t } = useT()
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null)
  const [generatingKey, setGeneratingKey] = useState(false)

  async function handleGenerate() {
    setGeneratingKey(true)
    try {
      // apiFetch 遇 401 自动跳转登录，这里无需单独处理
      const res = await apiFetch("/api/auth/recovery", { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setNewRecoveryKey(data.recoveryKey)
        onGenerated?.()
      } else {
        toast.error(data.error || t("admin.recoveryKeyGenerateFailed"))
      }
    } catch {
      toast.error(t("admin.networkError"))
    } finally {
      setGeneratingKey(false)
    }
  }

  function handleSaved() {
    setNewRecoveryKey(null)
    onSaved?.()
  }

  if (newRecoveryKey) {
    return (
      <div className={cn("space-y-3", className)}>
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
                .then(() => toast.success(t("admin.keyCopied")))
                .catch(() => toast.error(t("admin.copyFailed")))
            }}
          >
            {t("admin.copyRecoveryKey")}
          </Button>
          <Button type="button" size="sm" onClick={handleSaved}>
            {t("admin.recoveryKeySaved")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      {showHeading && (
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("admin.recoveryKey")}</p>
          <p className="text-xs text-muted-foreground">
            {t("admin.recoveryKeyHint")}
          </p>
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={generatingKey}
        onClick={handleGenerate}
      >
        {generatingKey
          ? t("admin.generatingKey")
          : t("admin.generateRecoveryKey")}
      </Button>
    </div>
  )
}
