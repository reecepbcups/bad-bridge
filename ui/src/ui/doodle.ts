// Seeded crayon shapes, ported from the mockup's scene code. Same seed, same wobble, every render.

/** A tiny deterministic PRNG (Park–Miller), seeded by a kid id. */
export function rng(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 2147483647 || 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** A wobbly closed blob around (cx, cy), as an SVG path. */
export function blob(cx: number, cy: number, r: number, rand: () => number): string {
  const n = 12
  const p: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = r + (rand() - 0.5) * r * 0.16
    p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
  }
  const at = (i: number) => p[i % n] as [number, number]
  const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const
  const m = mid(at(0), at(1))
  let d = `M${m[0].toFixed(1)},${m[1].toFixed(1)}`
  for (let i = 1; i <= n; i++) {
    const c = at(i)
    const nx = mid(c, at(i + 1))
    d += ` Q${c[0].toFixed(1)},${c[1].toFixed(1)} ${nx[0].toFixed(1)},${nx[1].toFixed(1)}`
  }
  return `${d}Z`
}

/** The Hub/Eth side of a bridge deck (the mockup's quadratic curve). */
export function deckY(x: number): number {
  const t = (x - 135) / 370
  return (1 - t) ** 2 * 122 + 2 * (1 - t) * t * 166 + t * t * 122
}

/** The top rope, for the hangers. */
export function ropeY(x: number): number {
  const t = (x - 135) / 370
  return (1 - t) ** 2 * 84 + 2 * (1 - t) * t * 138 + t * t * 84
}

/** A face doodle's parts inside a 0..100 box, for the placeholder art. */
export function face(seed: number): { head: string; eyes: [number, number][]; mouth: string; tint: number } {
  const rand = rng(seed + 7)
  const head = blob(50, 50, 32, rand)
  const spread = 10 + rand() * 4
  const eyeY = 44 + rand() * 4
  const eyes: [number, number][] = [
    [50 - spread, eyeY],
    [50 + spread, eyeY],
  ]
  const grin = rand() > 0.35
  const mouth = grin ? `M38,${eyeY + 16} Q50,${eyeY + 26} 62,${eyeY + 15}` : `M40,${eyeY + 19} L60,${eyeY + 18}`
  return { head, eyes, mouth, tint: seed % 3 }
}
