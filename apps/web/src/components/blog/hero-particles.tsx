/* Seeded PRNG — deterministic across SSR and client, so hydration matches */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type ParticleShape = "circle" | "square" | "diamond" | "triangle" | "ring" | "cross"

const SHAPES: ParticleShape[] = ["circle", "square", "diamond", "triangle", "ring", "cross"]
const HUES = [185, 190, 195, 200, 205, 210, 275, 280, 290, 300, 320, 330]

interface ParticleDef {
  left: string
  top?: string
  size: number
  hue: number
  delay: number
  duration: number
  shape: ParticleShape
}

function shapeStyle(shape: ParticleShape, size: number, color: string, glow?: string): React.CSSProperties {
  const base: React.CSSProperties = { width: size, height: size }
  switch (shape) {
    case "circle":
      return { ...base, background: color, borderRadius: "50%", ...(glow ? { boxShadow: glow } : {}) }
    case "square":
      return { ...base, background: color }
    case "diamond":
      return { ...base, background: color, clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)" }
    case "triangle":
      return { ...base, background: color, clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }
    case "ring":
      return { ...base, border: `1.5px solid ${color}`, borderRadius: "50%" }
    case "cross":
      return { ...base, background: color, clipPath: "polygon(35% 0, 65% 0, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0 65%, 0 35%, 35% 35%)" }
  }
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}

function makeParticles(
  seed: number,
  count: number,
  opts: { sizeRange: [number, number]; delayRange: [number, number]; durRange: [number, number]; leftPad?: number; includeTop?: boolean }
): ParticleDef[] {
  const rand = mulberry32(seed)
  const [szMin, szMax] = opts.sizeRange
  const [dMin, dMax] = opts.delayRange
  const [tMin, tMax] = opts.durRange
  const pad = opts.leftPad ?? 2
  return Array.from({ length: count }, () => ({
    left: `${(rand() * (100 - pad * 2) + pad).toFixed(1)}%`,
    ...(opts.includeTop ? { top: `${(rand() * 85 + 5).toFixed(1)}%` } : {}),
    size: Math.round(rand() * (szMax - szMin) + szMin),
    hue: pick(rand, HUES),
    delay: +(rand() * (dMax - dMin) + dMin).toFixed(1),
    duration: +(rand() * (tMax - tMin) + tMin).toFixed(1),
    shape: pick(rand, SHAPES),
  }))
}

/** Floating particles — drift upward from the bottom */
export const floatingParticles = makeParticles(42, 24, {
  sizeRange: [2, 6], delayRange: [0, 8], durRange: [8, 13], leftPad: 2,
})

/** Blinking particles — scattered across the hero */
export const blinkingParticles = makeParticles(7, 40, {
  sizeRange: [4, 14], delayRange: [0, 6], durRange: [3, 6], leftPad: 3, includeTop: true,
})

/** Login page sets — different seeds/counts so the scatter differs from
 *  the home hero; same shapes/hues via the shared factory. */
export const loginFloatingParticles = makeParticles(2024, 18, {
  sizeRange: [2, 6], delayRange: [0, 8], durRange: [9, 14], leftPad: 2,
})
export const loginBlinkingParticles = makeParticles(99, 32, {
  sizeRange: [3, 12], delayRange: [0, 6], durRange: [3, 6], leftPad: 3, includeTop: true,
})

export function HeroParticle({ p, className }: { p: ParticleDef; className: string }) {
  return (
    <span
      className={`${className} absolute`}
      style={{
        left: p.left,
        bottom: "-8px",
        ...shapeStyle(p.shape, p.size, `oklch(0.78 0.18 ${p.hue})`, `0 0 ${p.size * 3}px ${p.size}px oklch(0.78 0.18 ${p.hue} / 0.45)`),
        // backwards fill: during the delay the 0% frame (opacity 0) applies,
        // so a particle never renders fully opaque before its animation starts.
        animation: `hero-rise ${p.duration}s linear ${p.delay}s infinite backwards`,
      }}
    />
  )
}

export function HeroPixel({ p }: { p: ParticleDef }) {
  return (
    <span
      className="hero-pixel absolute"
      style={{
        left: p.left,
        top: p.top,
        opacity: 0,
        ...shapeStyle(p.shape, p.size, `oklch(0.72 0.17 ${p.hue} / 0.5)`, `0 0 ${p.size}px oklch(0.72 0.17 ${p.hue} / 0.3)`),
        animation: `hero-pixel-blink ${p.duration}s steps(1, end) ${p.delay}s infinite backwards`,
      }}
    />
  )
}
