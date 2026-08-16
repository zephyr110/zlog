"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/components/layout/trans"
import { apiFetch, clearToken } from "@/lib/api-client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ChangePasswordFormProps {
  /** Prefix for input ids so page + dialog instances don't collide. */
  idPrefix: string
  className?: string
  /** Called after a successful password change (before optional relogin). */
  onSuccess?: () => void
  /** Dialog uses a different failed-password copy than the settings page. */
  wrongPasswordKey?: "admin.changePasswordFailed" | "admin.currentPasswordWrong"
}

export function ChangePasswordForm({
  idPrefix,
  className,
  onSuccess,
  wrongPasswordKey = "admin.changePasswordFailed",
}: ChangePasswordFormProps) {
  const { t } = useT()
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error(t("admin.passwordsNotMatch"))
      return
    }
    if (newPassword.length < 8) {
      toast.error(t("admin.passwordLength"))
      return
    }

    setLoading(true)
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(t("admin.passwordChanged"))
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
        onSuccess?.()
        if (data.requireRelogin) {
          clearToken()
          router.push("/admin/login")
        }
      } else if (res.status === 401 && data.error === "Unauthorized") {
        onSuccess?.()
        clearToken()
        router.push("/admin/login")
      } else {
        toast.error(data.error || t(wrongPasswordKey))
      }
    } catch {
      toast.error(t("admin.networkError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-current`}>
          {t("admin.currentPassword")}
        </Label>
        <Input
          id={`${idPrefix}-current`}
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder={t("admin.currentPasswordPlaceholder")}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-new`}>
          {t("admin.newPassword")}
        </Label>
        <Input
          id={`${idPrefix}-new`}
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={t("admin.newPasswordPlaceholder")}
          required
          minLength={8}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-confirm`}>
          {t("admin.confirmPassword")}
        </Label>
        <Input
          id={`${idPrefix}-confirm`}
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={t("admin.confirmPasswordPlaceholder")}
          required
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading
          ? (t("admin.updating"))
          : (t("admin.updatePassword"))}
      </Button>
    </form>
  )
}
