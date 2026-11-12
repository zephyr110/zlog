import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type PageHeaderDecorVariant =
  | "about"
  | "archive"
  | "projects"
  | "series"
  | "tags"
  | "timeline"
  | "topics"

interface PageHeaderDecorProps {
  variant: PageHeaderDecorVariant
  /** Category glyph for the topics variant. */
  icon?: ReactNode
  /** Tag name shown in the tags variant. */
  label?: string
}

/**
 * Right-hand artwork for inner-page banners — the counterpart of the
 * homepage terminal. Purely decorative (aria-hidden), built from the
 * same foreground grid / line language as the banner canvas.
 */
export function PageHeaderDecor({ variant, icon, label }: PageHeaderDecorProps) {
  return (
    <DecorShell>
      {variant === "archive" && <ArchiveArt />}
      {variant === "timeline" && <TimelineArt />}
      {variant === "topics" && <TopicsArt icon={icon} />}
      {variant === "tags" && <TagsArt label={label} />}
      {variant === "series" && <SeriesArt />}
      {variant === "projects" && <ProjectsArt />}
      {variant === "about" && <AboutArt />}
    </DecorShell>
  )
}

/** Shared frame: corner ticks, dotted orbit, soft light, registration marks. */
function DecorShell({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="relative aspect-square w-full text-foreground">
      <div
        className="absolute inset-4 rounded-full blur-2xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-foreground) 5%, transparent), transparent 68%)",
        }}
      />
      {/* Corner brackets */}
      <span className="absolute left-0 top-0 size-4 border-l border-t border-foreground/20" />
      <span className="absolute right-0 top-0 size-4 border-r border-t border-foreground/20" />
      <span className="absolute bottom-0 left-0 size-4 border-b border-l border-foreground/20" />
      <span className="absolute bottom-0 right-0 size-4 border-b border-r border-foreground/20" />
      {/* Slow orbit — the dot at the top is what makes the rotation read. */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-[6%] size-[88%] text-foreground/15 motion-safe:animate-[decor-orbit_60s_linear_infinite]"
      >
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.4"
          strokeDasharray="0.6 6"
        />
        <circle cx="50" cy="2" r="1.4" className="fill-primary/70" />
      </svg>
      {/* Hairline crosshair */}
      <div className="absolute inset-x-6 top-1/2 h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />
      <div className="absolute inset-y-6 left-1/2 w-px bg-gradient-to-b from-transparent via-foreground/[0.08] to-transparent" />
      {/* Tiny registration ticks */}
      <div className="absolute right-1 top-6 flex flex-col gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-px w-2 bg-foreground/20" />
        ))}
      </div>
      <div className="relative z-10 flex size-full items-center justify-center">
        {children}
      </div>
    </div>
  )
}

function ArchiveArt() {
  return (
    <div className="relative size-[74%]">
      <div className="absolute inset-0 rounded-2xl border border-foreground/10 bg-background/30 motion-safe:animate-[decor-float_9s_ease-in-out_infinite]" />
      <div className="absolute inset-0 rotate-3 rounded-2xl border border-foreground/15 bg-background/50" />
      <div className="absolute inset-0 -rotate-1 overflow-hidden rounded-2xl border border-foreground/20 bg-background/85 shadow-sm">
        <div className="flex h-full">
          <div className="w-6 shrink-0 border-r border-foreground/10 bg-foreground/[0.03]">
            <div className="mx-auto mt-4 h-10 w-1 rounded-full bg-primary/50" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="h-1.5 w-10 rounded-full bg-foreground/25" />
              <span className="font-mono text-[9px] tracking-widest text-muted-foreground/70">
                2026
              </span>
            </div>
            {[92, 76, 84, 58].map((w, i) => (
              <span
                key={i}
                className="mb-2 h-1 rounded-full bg-foreground/10"
                style={{ width: `${w}%` }}
              />
            ))}
            <div className="mt-auto flex gap-1.5">
              {[18, 24, 14].map((w, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-2.5 rounded-[3px] border border-foreground/15",
                    i === 0 && "border-primary/30 bg-primary/10"
                  )}
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TimelineArt() {
  return (
    <svg viewBox="0 0 200 200" className="size-[80%] overflow-visible">
      <line
        x1="58"
        y1="18"
        x2="58"
        y2="182"
        stroke="currentColor"
        className="text-foreground/15"
        strokeDasharray="2 6"
      />
      {[
        { y: 34, w: 64 },
        { y: 84, w: 104 },
        { y: 126, w: 82 },
        { y: 166, w: 52 },
      ].map((node, i) => (
        <g key={node.y}>
          <line
            x1="72"
            y1={node.y}
            x2={72 + node.w}
            y2={node.y}
            stroke="currentColor"
            className={i === 1 ? "text-primary/40" : "text-foreground/[0.12]"}
            strokeWidth={i === 1 ? 2 : 1.5}
            strokeLinecap="round"
          />
          <circle
            cx="58"
            cy={node.y}
            r="4"
            fill="var(--color-background)"
            stroke="currentColor"
            className={i === 1 ? "text-primary/60" : "text-foreground/25"}
          />
        </g>
      ))}
      <circle cx="58" cy="84" r="13" className="fill-primary/10" />
      <circle cx="58" cy="84" r="5.5" className="fill-primary/70" />
      <circle
        cx="58"
        cy="84"
        r="11"
        fill="none"
        stroke="currentColor"
        className="text-primary/40 motion-safe:animate-[decor-pulse_3.2s_ease-in-out_infinite]"
      />
      <circle
        cx="58"
        cy="34"
        r="2"
        className="fill-primary/50 motion-safe:animate-[decor-travel_7s_ease-in-out_infinite]"
      />
    </svg>
  )
}

function TopicsArt({ icon }: { icon?: ReactNode }) {
  return (
    <div className="relative flex size-[78%] items-center justify-center">
      <div className="absolute inset-[4%] rounded-full border border-foreground/10" />
      <div className="absolute inset-[17%] rounded-full border border-dashed border-foreground/15 motion-safe:animate-[decor-orbit_45s_linear_infinite_reverse]" />
      <div className="absolute inset-[30%] rounded-full border border-foreground/10" />
      <span className="absolute left-1/2 top-[4%] size-1.5 -translate-x-1/2 rounded-full bg-primary/60" />
      <span className="absolute left-[17%] top-1/2 size-1 -translate-y-1/2 rounded-full bg-foreground/30" />
      <span className="absolute right-[10%] top-[28%] size-2 rotate-45 border border-foreground/25 bg-background/60" />
      <div className="relative flex size-20 items-center justify-center rounded-2xl border border-foreground/15 bg-background/80 text-primary shadow-sm [&_svg]:size-8">
        {icon ?? <span className="text-2xl font-light">#</span>}
      </div>
      <div className="absolute inset-0 [transform:rotate(-12deg)]">
        <span className="absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/[0.06]" />
      </div>
    </div>
  )
}

function TagsArt({ label }: { label?: string }) {
  return (
    <div className="relative flex size-[80%] items-center justify-center">
      <span className="select-none font-mono text-[10rem] font-bold leading-none text-foreground/[0.05]">
        #
      </span>
      <div className="absolute left-[4%] top-[24%] -rotate-6 rounded-full border border-foreground/10 bg-background/50 px-3 py-1.5">
        <span className="block h-1 w-8 rounded-full bg-foreground/15" />
      </div>
      <div className="absolute bottom-[20%] right-[4%] rotate-6 rounded-full border border-foreground/10 bg-background/50 px-3 py-1.5">
        <span className="block h-1 w-6 rounded-full bg-foreground/15" />
      </div>
      <div className="relative -rotate-2 rounded-full border border-foreground/20 bg-background/85 px-5 py-2.5 shadow-sm">
        <span className="flex max-w-40 items-center gap-2">
          <span className="font-mono text-sm text-primary/70">#</span>
          <span className="truncate text-sm font-medium text-foreground/80">
            {(label || "tag").toLowerCase()}
          </span>
          <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
        </span>
      </div>
    </div>
  )
}

function SeriesArt() {
  const chapters = [
    { n: "01", w: 62, lines: 42 },
    { n: "02", w: 48, lines: 30 },
    { n: "03", w: 56, lines: 36 },
  ]
  return (
    <div className="relative size-[78%]">
      <div className="absolute bottom-6 left-5 top-6 w-px bg-gradient-to-b from-foreground/5 via-foreground/20 to-foreground/5" />
      <div className="flex h-full flex-col justify-center gap-3">
        {chapters.map((c, i) => (
          <div
            key={c.n}
            className={cn(
              "relative ml-9 flex h-14 items-center gap-3 rounded-xl border bg-background/60 px-3",
              i === 1
                ? "border-primary/30 shadow-sm"
                : "border-foreground/10"
            )}
          >
            <span
              className={cn(
                "absolute -left-9 top-1/2 size-2 -translate-y-1/2 rounded-full border",
                i === 1
                  ? "border-primary/50 bg-primary/40"
                  : "border-foreground/20 bg-background"
              )}
            />
            <span className="w-7 shrink-0 font-mono text-[10px] text-muted-foreground/60">
              {c.n}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <span
                className="block h-1.5 rounded-full bg-foreground/15"
                style={{ width: `${c.w}%` }}
              />
              <span
                className="block h-1 rounded-full bg-foreground/[0.08]"
                style={{ width: `${c.lines}%` }}
              />
            </div>
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                i === 1 ? "bg-primary/60" : "bg-foreground/15"
              )}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function ProjectsArt() {
  return (
    <svg viewBox="0 0 200 200" className="size-[82%] overflow-visible">
      {/* Editor window */}
      <rect
        x="16"
        y="34"
        width="168"
        height="132"
        rx="12"
        fill="none"
        stroke="currentColor"
        className="text-foreground/10"
      />
      <line
        x1="16"
        y1="58"
        x2="184"
        y2="58"
        stroke="currentColor"
        className="text-foreground/[0.08]"
      />
      {[28, 36, 44].map((x) => (
        <circle key={x} cx={x} cy="46" r="2" className="fill-foreground/15" />
      ))}
      {/* Branch graph */}
      <path
        d="M38 126 H164"
        fill="none"
        stroke="currentColor"
        className="text-primary/40"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M74 126 C 88 126, 90 88, 106 88 H152"
        fill="none"
        stroke="currentColor"
        className="text-foreground/25"
        strokeWidth="1.5"
        strokeDasharray="3 5"
        strokeLinecap="round"
      />
      <path
        d="M106 88 C 122 88, 124 148, 140 148 H164"
        fill="none"
        stroke="currentColor"
        className="text-foreground/20 motion-safe:animate-[decor-dash_6s_linear_infinite]"
        strokeWidth="1.5"
        strokeDasharray="3 5"
        strokeLinecap="round"
      />
      {[
        { x: 38, y: 126, primary: false },
        { x: 74, y: 126, primary: true },
        { x: 106, y: 88, primary: false },
        { x: 152, y: 88, primary: false },
        { x: 140, y: 148, primary: false },
        { x: 164, y: 148, primary: true },
      ].map((c) => (
        <circle
          key={`${c.x}-${c.y}`}
          cx={c.x}
          cy={c.y}
          r="4"
          fill="var(--color-background)"
          stroke="currentColor"
          strokeWidth="1.5"
          className={c.primary ? "text-primary/60" : "text-foreground/30"}
        />
      ))}
      <circle cx="164" cy="126" r="4" className="fill-primary/60" />
    </svg>
  )
}

function AboutArt() {
  return (
    <div className="relative flex size-[80%] items-center justify-center">
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
        <circle
          cx="100"
          cy="100"
          r="74"
          fill="none"
          stroke="currentColor"
          className="text-foreground/10"
        />
        <circle
          cx="100"
          cy="100"
          r="56"
          fill="none"
          stroke="currentColor"
          className="text-foreground/[0.08]"
          strokeDasharray="1 7"
        />
        <path
          d="M100 26 A74 74 0 0 1 173.5 89"
          fill="none"
          stroke="currentColor"
          className="text-primary/40"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M36 132 C 54 100, 68 150, 84 120 S 108 94, 118 122 S 146 144, 164 104"
          fill="none"
          stroke="currentColor"
          className="text-foreground/40 motion-safe:animate-[decor-sign_8s_ease-in-out_infinite]"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute left-[80%] top-[52%] h-4 w-[2px] rounded-full bg-primary/60 motion-safe:animate-[decor-blink_1.6s_steps(1)_infinite]" />
      <div className="absolute right-[4%] top-[14%] flex flex-col items-end gap-1">
        <span className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground/50">
          BIO
        </span>
        <span className="h-px w-8 bg-foreground/20" />
      </div>
    </div>
  )
}
