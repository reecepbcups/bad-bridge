import { useEffect, useRef, useState } from 'react'
import type { KidId } from '../chain/types'
import { kidImage } from '../kids/image'
import type { Stage } from '../trips/types'
import { blob, deckY, face, rng, ropeY } from './doodle'
import { kidWord } from './format'
import { useReducedMotion } from './hooks'
import { STAGE_LINE } from './stages'

// The mockup's rope bridge, driven by the real stage: walkers walk to an anchor for their stage and bob there.

/** Where the lead walker stands for each stage (x in the 640-wide scene). */
const ANCHOR: Readonly<Record<Stage, number>> = {
  'home-hub': 70,
  locked: 96,
  'catching-up': 196,
  crossing: 262,
  proving: 330,
  ready: 574,
  'home-eth': 604,
}
const START_X = 70
const GAP = 34
const SHOWN = 3

const PLANKS = (() => {
  let d = ''
  for (let x = 150; x <= 490; x += 20) d += `M${x},${(deckY(x) - 7).toFixed(1)} L${x},${(deckY(x) + 5).toFixed(1)} `
  return d
})()

const HANGERS = (() => {
  let d = ''
  for (let x = 175; x <= 465; x += 40) d += `M${x},${ropeY(x).toFixed(1)} L${x},${(deckY(x) - 6).toFixed(1)} `
  return d
})()

function groundY(x: number): number {
  return x < 135 || x > 505 ? 119 : deckY(x) - 3
}

/** Tweens the lead walker's x toward `target` along the deck. Reduced motion: jumps straight there. */
function useWalk(target: number, reduced: boolean): number {
  const [x, setX] = useState(START_X)
  const current = useRef(START_X)
  useEffect(() => {
    if (reduced) return
    const from = current.current
    if (from === target) return
    const duration = Math.min(2600, Math.max(700, Math.abs(target - from) * 7))
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      const v = from + (target - from) * eased
      current.current = v
      setX(v)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, reduced])
  return reduced ? target : x
}

export function Scene({ ids, stage }: { ids: readonly KidId[]; stage: Stage | null }) {
  const reduced = useReducedMotion()
  const lead = useWalk(ANCHOR[stage ?? 'home-hub'], reduced)
  const shown = ids.slice(0, SHOWN)
  const extra = ids.length - shown.length
  const where = stage ? STAGE_LINE[stage].toLowerCase() : 'getting ready'
  return (
    <svg
      className="scene"
      viewBox="0 0 640 230"
      role="img"
      aria-label={`${ids.length === 1 ? 'Your kid' : `Your ${ids.length} ${kidWord(ids.length)}`} on the bridge from Cosmos Hub to Ethereum: ${where}`}
    >
      <path
        d="M150,212 q15,-8 30,0 t30,0 t30,0 t30,0 t30,0 t30,0 t30,0 t30,0 t30,0 t30,0 t30,0"
        fill="none"
        stroke="var(--eth)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity=".55"
      />
      <path d="M0,230 L0,124 Q45,112 92,118 L138,121 L150,230 Z" fill="var(--hub-tint)" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M640,230 L640,124 Q595,112 548,118 L502,121 L490,230 Z" fill="var(--eth-tint)" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <text x="16" y="160" className="hub">
        Cosmos Hub
      </text>
      <text x="624" y="160" textAnchor="end" className="eth">
        Ethereum
      </text>
      <path d="M135,84 Q320,138 505,84" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d={HANGERS} stroke="currentColor" strokeWidth="1.8" opacity=".7" />
      <path d="M135,122 Q320,166 505,122" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d={PLANKS} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M135,76 L135,124 M505,76 L505,124" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <g transform="translate(598,118)">
        <path d="M0,0 L0,-46" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M0,-46 L24,-39 L0,-31 Z" fill="var(--crayon)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </g>
      {/* last first, so the lead walker is drawn on top */}
      {shown
        .map((id, i) => {
          const x = lead - i * GAP
          return (
            <g key={id} className="walker" transform={`translate(${x.toFixed(1)},${groundY(x).toFixed(1)})`}>
              <g className="bob" style={{ animationDelay: `${i * 0.17}s` }}>
                <Walker id={id} />
              </g>
              {i === shown.length - 1 && extra > 0 && (
                <text x="-30" y="-14" textAnchor="end" className="more">
                  +{extra}
                </text>
              )}
            </g>
          )
        })
        .reverse()}
    </svg>
  )
}

function Walker({ id }: { id: KidId }) {
  const [failed, setFailed] = useState<readonly string[]>([])
  const src = kidImage(id).find((s) => !failed.includes(s))
  const d = blob(0, -26, 24, rng(id))
  const clip = `walker-clip-${id}`
  return (
    <>
      <clipPath id={clip}>
        <path d={d} />
      </clipPath>
      {src ? (
        <image
          href={src}
          x="-26"
          y="-52"
          width="52"
          height="52"
          clipPath={`url(#${clip})`}
          preserveAspectRatio="xMidYMid slice"
          onError={() => setFailed((f) => [...f, src])}
        />
      ) : (
        <WalkerDoodle id={id} />
      )}
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.5" />
    </>
  )
}

/** The placeholder face, squeezed into the walker's blob. */
function WalkerDoodle({ id }: { id: KidId }) {
  const f = face(id)
  // face() draws in a 0..100 box centred on 50,50; the walker's head is centred on 0,-26 with r 24
  return (
    <g transform="translate(-26,-52) scale(0.52)">
      <path d={f.head} fill="var(--sun)" stroke="none" />
      {f.eyes.map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="4.5" fill="var(--sun-ink)" />
      ))}
      <path d={f.mouth} fill="none" stroke="var(--sun-ink)" strokeWidth="4" strokeLinecap="round" />
    </g>
  )
}
