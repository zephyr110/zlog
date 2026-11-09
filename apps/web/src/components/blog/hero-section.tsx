"use client"

import Image from "next/image"
import Link from "next/link"
import { useT } from "@/components/layout/trans"
import { ArrowRight, Archive } from "lucide-react"
import { BannerArt, pageBannerMinClass } from "@/components/layout/banner-art"
import { cn } from "@/lib/utils"

export function HeroSection({ postCount }: { postCount: number }) {
  const { t } = useT()
  const articlesLabel = t("site.articlesPublished") as (n: number) => string

  return (
    <section
      className={cn(
        "relative flex flex-col overflow-hidden border-b bg-background",
        pageBannerMinClass
      )}
    >
      <BannerArt />

      {/* ── Content ── */}
      <div className="container relative mx-auto flex max-w-5xl flex-1 flex-col justify-center px-4 py-12 md:py-16 lg:py-20 xl:max-w-7xl 2xl:max-w-[84rem]">
        <div className="flex items-center justify-between gap-10">
          <div className="min-w-0 max-w-2xl flex-1">
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

          {/* Local copy of zephyr110/zephyr110 assets/terminal.svg — no third-party request. */}
          <div
            className="hidden w-[24rem] shrink-0 animate-in fade-in duration-700 lg:block xl:w-[34rem] 2xl:w-[38rem]"
            style={{ animationFillMode: "both", animationDelay: "400ms" }}
          >
            <Image
              src="/zephyr-terminal.svg"
              alt={t("site.heroTerminalAlt")}
              width={880}
              height={336}
              unoptimized
              loading="eager"
              className="w-full"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
