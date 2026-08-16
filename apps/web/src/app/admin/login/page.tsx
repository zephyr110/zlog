"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSiteConfig } from "@/components/layout/site-config-provider"
import { DEMO_ACCOUNT, isDemoMode } from "@/lib/demo-mode"
import { siteLogoSrc } from "@/lib/site-config"
import { SiteLogo } from "@/components/layout/site-logo"
import { useT } from "@/components/layout/trans"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { setToken } from "@/lib/api-client"
import { Eye, EyeOff, ArrowLeft } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import {
  HeroParticle,
  HeroPixel,
  loginBlinkingParticles,
  loginFloatingParticles,
} from "@/components/blog/hero-particles"
import { cn } from "@/lib/utils"

type LoginMode = "login" | "reset"

/** Primary submit button on the login/reset forms. The default variant
 *  only fades to primary/80 on hover; the login page gets a theme-aware
 *  treatment. Because --primary flips with the theme (near-black on
 *  light, near-white on dark), a fixed brightness-* goes the wrong way
 *  on one theme (black → dead black, white → blown out). Instead we
 *  color-mix a touch of the OPPOSITE anchor: hover mixes the button a
 *  little toward white on light (lift) and toward black on dark
 *  (settle) — both read as a natural press feedback without clipping. */
// Base colors come from Button's primary variant; only layout and the
// color-mix press theming (which no variant provides) are re-specified.
const LOGIN_SUBMIT_CLASSES =
  "h-10 w-full shadow-sm shadow-primary/25 transition-all duration-200 hover:shadow-md hover:shadow-primary/30 focus-visible:ring-primary/40 " +
  "hover:bg-[color-mix(in_oklab,var(--primary),white_8%)] active:bg-[color-mix(in_oklab,var(--primary),black_6%)] " +
  "dark:hover:bg-[color-mix(in_oklab,var(--primary),black_10%)] dark:active:bg-[color-mix(in_oklab,var(--primary),black_18%)]"

/* ── Layer: square line grid ──
   50px cells (divides the 400px card width evenly). Phase is pinned so
   a vertical line lands exactly on the card's left edge
   (center − card-w/2); subsequent lines then land on center − 150,
   −100, …, +200 — so the right edge coincides with a grid line too.
   LoginCellsSweep uses the same size + phase so the sweep tracks these
   cells instead of drifting across a second, misaligned grid. */
function LoginGridLayer() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-25"
      style={{
        backgroundImage: `
          linear-gradient(to right, color-mix(in oklab, var(--color-foreground) 9%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in oklab, var(--color-foreground) 9%, transparent) 1px, transparent 1px)
        `,
        backgroundSize: "50px 50px",
        // Tile origin at the card's left edge → lines frame the form.
        backgroundPosition: "calc(50% - (var(--card-w) / 2)) top",
        maskImage:
          "radial-gradient(ellipse 70% 60% at 50% 50%, black 20%, transparent 72%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 70% 60% at 50% 50%, black 20%, transparent 72%)",
      }}
    />
  )
}

/* ── Layer: sweeping cell highlight (reuses global hero-cells-sweep).
   Same 50px size + card-edge phase as LoginGridLayer. ── */
function LoginCellsSweep() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 motion-safe:block hidden opacity-[0.08] dark:opacity-[0.14]"
      style={{
        backgroundImage:
          "conic-gradient(from 90deg at 2px 2px, transparent 90deg, oklch(0.6 0.2 290) 0)",
        backgroundSize: "50px 50px",
        backgroundPosition: "calc(50% - (var(--card-w) / 2)) top",
        maskImage:
          "linear-gradient(90deg, transparent 30%, black 42%, black 58%, transparent 70%)",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent 30%, black 42%, black 58%, transparent 70%)",
        maskSize: "300% 100%",
        WebkitMaskSize: "300% 100%",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        animation: "hero-cells-sweep 8s linear infinite",
      }}
    />
  )
}

export default function AdminLoginPage() {
  const router = useRouter()
  const { t } = useT()
  const site = useSiteConfig()
  const logoSrc = siteLogoSrc(site)
  const demo = isDemoMode()
  const [mode, setMode] = useState<LoginMode>("login")
  const [username, setUsername] = useState(demo ? DEMO_ACCOUNT.username : "")
  const [password, setPassword] = useState(demo ? DEMO_ACCOUNT.password : "")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  // Reset-mode fields
  const [recoveryKey, setRecoveryKey] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    usernameRef.current?.focus()
  }, [mode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      if (res.ok) {
        const data = await res.json()
        setToken(data.token)
        toast.success(t("admin.welcomeBack"))
        router.push("/admin/dashboard")
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || (t("admin.invalidCredentials")))
        setShake(true)
        window.setTimeout(() => setShake(false), 420)
      }
    } catch {
      toast.error(t("admin.networkError"))
    } finally {
      setLoading(false)
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error(t("admin.passwordsNotMatch"))
      return
    }
    setLoading(true)

    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, recoveryKey, newPassword }),
      })

      if (res.ok) {
        toast.success(t("admin.resetPasswordSuccess"))
        // Back to sign-in with the username prefilled. Demo mode
        // restores the pre-filled password (demoHint promises it).
        setMode("login")
        setPassword(demo ? DEMO_ACCOUNT.password : "")
        setRecoveryKey("")
        setNewPassword("")
        setConfirmPassword("")
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || (t("admin.resetPasswordFailed")))
      }
    } catch {
      toast.error(t("admin.networkError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12 [--card-w:400px]">
      {/* Top glow — a FLAT ellipse sliced along its horizontal axis, the
          cut sitting exactly on the page's top edge. Only the lower half
          of the ellipse is visible, so the light is brightest right at
          the top-center and thins out as it travels down the Y axis —
          the wide horizontal radius keeps it a shallow, arc-like band
          rather than a round blob.

          Theme-aware color: a cool white beam on the dark theme, a warm
          amber beam on the light theme. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[46%] opacity-20"
        style={{
          // Ellipse centered at 50% 0% (on the top edge). Rx = 78% (wide,
          // X axis), Ry = 100% of this box's height (the downward falloff).
          // --login-glow is set per-theme below (white on dark, amber on
          // light); the radial fade gives the Y-negative dissolve.
          background:
            "radial-gradient(ellipse 78% 100% at 50% 0%, var(--login-glow) 0%, transparent 68%)",
        }}
      />
      {/* Faint square grid — same recipe as the home hero (color-mix
          hairlines, 56px cells, centered radial mask). This single layer
          already carries BOTH the vertical and horizontal lines, so there
          is no separate card-framing grid — a second offset grid was
          overlapping this one and producing a double/moiré pattern. */}
      <LoginGridLayer />
      {/* Sweeping cell highlight — reuses the global hero-cells-sweep
          keyframes; a slow horizontal light band crossing the grid. */}
      <LoginCellsSweep />

      {/* Particles — same rising/blinking effects as the home hero,
          reusing the shared seeded sets and global keyframes */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 motion-safe:block hidden"
      >
        {loginBlinkingParticles.map((p, i) => (
          <HeroPixel key={i} p={p} />
        ))}
        {loginFloatingParticles.map((p, i) => (
          <HeroParticle key={i} p={p} className="hero-particle" />
        ))}
      </div>

      <div className="relative z-10 flex w-full max-w-[var(--card-w)] flex-col items-center">
        {/* Brand lockup — mark + wordmark on one line, then sign-in copy */}
        <div className="mb-8 flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-3 duration-500">
          <Link
            href="/"
            className="inline-flex items-center gap-3 rounded-xl transition-opacity hover:opacity-80"
          >
            {/* Full-bleed rounded tile, same recipe as the chip — and
                bg-card is opaque, so a dark-mode inverted transparent PNG
                rasterizes onto it, not onto the page background. */}
            <span className="flex size-11 items-center justify-center overflow-hidden rounded-lg border bg-card shadow-sm">
              <SiteLogo
                src={logoSrc}
                invertInDark={site.logoInvertInDark ?? false}
                className="size-full rounded-lg object-cover"
              />
            </span>
            <span className="font-heading text-2xl font-black tracking-tight text-foreground">
              {site.name}
            </span>
          </Link>
          <h1 className="mt-4 whitespace-nowrap text-sm font-normal text-muted-foreground">
            {mode === "login"
              ? (demo ? t("admin.demoHint") : t("admin.loginDesc"))
              : (t("admin.resetPassword"))}
          </h1>
        </div>

        {/* Shake lives on a wrapper, not the Card: both animate-login-shake
            and the Card's animate-in utilities set `animation`, so toggling
            the class on the Card would restart the enter animation after
            every failed login (the card blinks out and re-fades). */}
        <div
          className={cn("w-full", mode === "login" && shake && "animate-login-shake")}
        >
        <Card
          className={cn(
            "w-full gap-0 py-0 ring-foreground/10 shadow-xl shadow-foreground/[0.04] dark:shadow-black/30 animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both [animation-delay:80ms]"
          )}
        >
          <CardContent className="p-7 sm:p-8">
            {mode === "login" ? (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="username">{t("admin.username")}</Label>
                    <Input
                      ref={usernameRef}
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      required
                      className="h-10 px-3"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="password">{t("admin.password")}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        className="h-10 px-3 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={
                          showPassword
                            ? (t("admin.hidePassword"))
                            : (t("admin.showPassword"))
                        }
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    type="submit"
                    className={LOGIN_SUBMIT_CLASSES}
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner size="sm" className="text-primary-foreground" />
                        {t("admin.signingIn")}
                      </span>
                    ) : (
                      (t("admin.signIn"))
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      // Don't carry the typed password into reset mode.
                      setPassword("")
                      setShowPassword(false)
                      setMode("reset")
                    }}
                    className="h-8 self-center text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t("admin.forgotPassword")}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetSubmit} className="flex flex-col gap-6">
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reset-username">{t("admin.username")}</Label>
                    <Input
                      ref={usernameRef}
                      id="reset-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      required
                      className="h-10 px-3"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="recovery-key">{t("admin.recoveryKey")}</Label>
                    <Input
                      id="recovery-key"
                      type="text"
                      value={recoveryKey}
                      onChange={(e) => setRecoveryKey(e.target.value)}
                      placeholder="ABCDE-FGHIJ-KLMNO-PQRST"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      required
                      className="h-10 px-3 font-mono text-sm tracking-wider"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reset-new-pw">{t("admin.newPassword")}</Label>
                    <Input
                      id="reset-new-pw"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder={t("admin.newPasswordPlaceholder")}
                      required
                      minLength={8}
                      className="h-10 px-3"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reset-confirm-pw">{t("admin.confirmPassword")}</Label>
                    <Input
                      id="reset-confirm-pw"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder={t("admin.confirmPasswordPlaceholder")}
                      required
                      minLength={8}
                      className="h-10 px-3"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    type="submit"
                    className={LOGIN_SUBMIT_CLASSES}
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner size="sm" className="text-primary-foreground" />
                        {t("admin.resetting")}
                      </span>
                    ) : (
                      (t("admin.resetPassword"))
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      // Clear the sensitive reset fields so a stray Enter
                      // can't re-submit with the old key/password.
                      setRecoveryKey("")
                      setNewPassword("")
                      setConfirmPassword("")
                      // Demo mode restores the pre-filled password.
                      setPassword(demo ? DEMO_ACCOUNT.password : "")
                      setMode("login")
                    }}
                    className="h-8 self-center text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t("admin.backToLogin")}
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
        </div>

        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground animate-in fade-in duration-500 fill-mode-both [animation-delay:160ms]"
        >
          <ArrowLeft size={14} />
          {t("admin.backToSite")}
        </Link>
      </div>

    </div>
  )
}
