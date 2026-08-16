"use client"

import Link from "next/link"
import { useT } from "@/components/layout/trans"
import { ArrowRight, Archive } from "lucide-react"
import { floatingParticles, blinkingParticles, HeroParticle, HeroPixel } from "./hero-particles"

/* ── Layer: Line grid ── */
function GridLayer() {
  return (
    <div
      className="absolute inset-0"
      aria-hidden
      style={{
        backgroundImage: `
          linear-gradient(to right, color-mix(in oklab, var(--color-foreground) 9%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in oklab, var(--color-foreground) 9%, transparent) 1px, transparent 1px)
        `,
        backgroundSize: "56px 56px",
        maskImage: "radial-gradient(ellipse 95% 90% at 50% 0%, black 35%, transparent 80%)",
        WebkitMaskImage: "radial-gradient(ellipse 95% 90% at 50% 0%, black 35%, transparent 80%)",
      }}
    />
  )
}

/* ── Layer: Sweeping cell highlight ── */
function CellsSweepLayer() {
  return (
    <div
      className="absolute inset-0 motion-safe:block hidden opacity-[0.10] dark:opacity-[0.16]"
      aria-hidden
      style={{
        backgroundImage: "conic-gradient(from 90deg at 2px 2px, transparent 90deg, oklch(0.6 0.2 290) 0)",
        backgroundSize: "56px 56px",
        maskImage: "linear-gradient(90deg, transparent 30%, black 42%, black 58%, transparent 70%)",
        WebkitMaskImage: "linear-gradient(90deg, transparent 30%, black 42%, black 58%, transparent 70%)",
        maskSize: "300% 100%",
        WebkitMaskSize: "300% 100%",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        animation: "hero-cells-sweep 8s linear infinite",
      }}
    />
  )
}

/* ── Layer: Blinking particles ── */
function BlinkingLayer() {
  return (
    <div className="absolute inset-0 motion-safe:block hidden" aria-hidden>
      {blinkingParticles.map((p, i) => (
        <HeroPixel key={i} p={p} />
      ))}
    </div>
  )
}

/* ── Layer: Floating particles ── */
function FloatingLayer() {
  return (
    <div className="absolute inset-0 motion-safe:block hidden" aria-hidden>
      {floatingParticles.map((p, i) => (
        <HeroParticle key={i} p={p} className="hero-particle" />
      ))}
    </div>
  )
}

export function HeroSection({ postCount }: { postCount: number }) {
  const { t } = useT()
  const articlesLabel = t("site.articlesPublished") as (n: number) => string

  return (
    <section className="relative overflow-hidden border-b bg-background">
      <GridLayer />
      <CellsSweepLayer />
      <BlinkingLayer />
      <FloatingLayer />

      {/* Bottom blend into the post feed */}
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background to-transparent" aria-hidden />

      {/* ── Content ── */}
      <div className="container mx-auto px-4 py-12 md:py-16 lg:py-20 max-w-5xl 2xl:max-w-7xl relative">
        <div className="max-w-2xl">
          {/* Article count badge */}
          <div
            className="inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-background/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm mb-7 animate-in fade-in slide-in-from-bottom-4 duration-700"
            style={{ animationFillMode: "both" }}
          >
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40 dark:bg-primary/70" />
              <span className="relative size-2.5 rounded-full bg-primary ring-2 ring-primary/25 dark:ring-primary/45 dark:shadow-[0_0_10px_rgba(255,255,255,0.35)]" />
            </span>
            {articlesLabel(postCount)}
          </div>

          {/* Title */}
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.05] animate-in fade-in slide-in-from-bottom-4 duration-700"
            style={{ animationFillMode: "both", animationDelay: "100ms" }}
          >
            {t("site.heroTitleLine1")}
            <br />
            <span className="bg-gradient-to-r from-foreground via-foreground/75 to-foreground/40 bg-clip-text text-transparent">
              {t("site.heroTitleLine2")}
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-700"
            style={{ animationFillMode: "both", animationDelay: "200ms" }}
          >
            {t("site.heroSubtitle")}
          </p>

          {/* Actions */}
          <div
            className="mt-9 flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700"
            style={{ animationFillMode: "both", animationDelay: "300ms" }}
          >
            <Link
              href="#post-feed"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 dark:hover:brightness-125"
            >
              {t("site.browsePosts")}
              <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/archive"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/50 px-5 py-2.5 text-sm font-medium text-foreground/80 backdrop-blur-sm transition-colors duration-200 hover:bg-muted/60 hover:text-foreground"
            >
              <Archive size={15} />
              {t("site.archive")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
