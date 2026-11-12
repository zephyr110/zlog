import { cn } from "@/lib/utils"
import {
  blinkingParticles,
  floatingParticles,
  HeroParticle,
  HeroPixel,
} from "@/components/blog/hero-particles"

/** 首页 hero 与内页 PageHeader 共用的最小高度，避免内页 banner 明显更矮。 */
export const pageBannerMinClass =
  "min-h-[22rem] md:min-h-[28rem] lg:min-h-[34rem]"

/** 与首页 hero 相同的网格、扫光和粒子层。 */
export function BannerArt({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div
        className="banner-grid absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, color-mix(in oklab, var(--color-foreground) 9%, transparent) 1px, transparent 1px),
            linear-gradient(to bottom, color-mix(in oklab, var(--color-foreground) 9%, transparent) 1px, transparent 1px)
          `,
          maskImage: "radial-gradient(ellipse 95% 90% at 50% 0%, black 35%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 95% 90% at 50% 0%, black 35%, transparent 80%)",
        }}
      />
      <div
        className="banner-grid absolute inset-0 hidden opacity-[0.10] motion-safe:block dark:opacity-[0.16]"
        style={{
          backgroundImage:
            "conic-gradient(from 90deg at 2px 2px, transparent 90deg, oklch(0.6 0.2 calc(var(--banner-hue, 257) + 33)) 0)",
          maskImage: "linear-gradient(90deg, transparent 30%, black 42%, black 58%, transparent 70%)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 30%, black 42%, black 58%, transparent 70%)",
          maskSize: "300% 100%",
          WebkitMaskSize: "300% 100%",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          animation: "hero-cells-sweep 8s linear infinite",
        }}
      />
      <div className="absolute inset-0 hidden motion-safe:block">
        {blinkingParticles.map((p, i) => (
          <HeroPixel key={`blink-${i}`} p={p} />
        ))}
        {floatingParticles.map((p, i) => (
          <HeroParticle key={`float-${i}`} p={p} className="hero-particle" />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background to-transparent" />
    </div>
  )
}
