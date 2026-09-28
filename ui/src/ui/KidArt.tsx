import { useState } from 'react'
import type { KidId } from '../chain/types'
import { kidImage } from '../kids/image'
import { face } from './doodle'

/** Fill and line color pairs; the yellow one keeps dark lines in both themes. */
const TINTS = [
  ['var(--hub-tint)', 'var(--ink)'],
  ['var(--eth-tint)', 'var(--ink)'],
  ['var(--sun)', 'var(--sun-ink)'],
] as const

/**
 * A kid's picture. Walks kidImage()'s candidates on error; with none left it's a crayon doodle.
 * Lazy by default, so a wallet with 100+ kids only loads what's on screen.
 */
export function KidArt({
  id,
  size = 96,
  className = 'art',
  eager = false,
  decorative = false,
}: {
  id: KidId
  size?: number
  className?: string
  /** Load now, for above-the-fold art (celebrations). */
  eager?: boolean
  /** Hidden from screen readers when the text next to it already says "#1234". */
  decorative?: boolean
}) {
  const [failed, setFailed] = useState<readonly string[]>([])
  const src = kidImage(id).find((s) => !failed.includes(s))
  const label = `Bad Kid #${id}`
  if (!src) return <KidDoodle id={id} className={className} label={decorative ? undefined : label} />
  return (
    <img
      className={className}
      src={src}
      alt={decorative ? '' : label}
      width={size}
      height={size}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed((f) => [...f, src])}
    />
  )
}

/** Placeholder when there's no picture: a seeded crayon face. */
export function KidDoodle({ id, className = 'art', label }: { id: KidId; className?: string; label?: string }) {
  const f = face(id)
  const [fill, line] = TINTS[f.tint] ?? TINTS[0]
  return (
    <svg
      className={`${className} doodle`}
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={f.head} fill={fill} stroke={line} strokeWidth="3" strokeLinejoin="round" />
      {f.eyes.map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="3.6" fill={line} />
      ))}
      <path d={f.mouth} fill="none" stroke={line} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
