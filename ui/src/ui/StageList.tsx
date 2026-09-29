import type { ReactNode } from 'react'
import { useBridge } from '../chain/context'
import type { Health, Stage } from '../trips/types'
import { ExtLink } from './ExtLink'
import { aboutMinutes, blocks, clockTime, shortHash } from './format'
import { useWallClock } from './hooks'
import { JOURNEY, JOURNEY_AT, TRACK_LABELS } from './stages'

/** What the stage list needs to know about a trip (or a group of kids sent in one tx). */
export interface StageFacts {
  stage: Stage
  sendTx?: string
  blocksToGo?: number
  stuck: boolean
  /** proving: when it was first seen proving. */
  provingSince?: Date
}

// COPY: step 2 title while the client is behind
const OUT_OF_SYNC = 'Ethereum out of sync'
// COPY: step 3 title while the proof is being made
const PROVING = 'Proving'

/** Sightings this short say nothing about how long the proof takes, so no clock until then. */
export const PROVING_QUIET_MS = 5 * 60_000

// COPY: proving sighting and ready line
/** "Seen proving on this device since 9:41 pm.", once it has been seen proving for a while. */
export function provingSeen(since: Date | undefined, now: number): string | null {
  if (!since || now - since.getTime() < PROVING_QUIET_MS) return null
  return `Seen proving on this device since ${clockTime(since, new Date(now))}.`
}

/**
 * The four-step journey, with live details on the current step. `kids` is how many travel together (for the
 * wording); `showLag` is off where the page already says how far behind Ethereum is.
 */
export function StageList({
  facts,
  health,
  kids = 1,
  showLag = true,
  speedUp,
}: {
  facts: StageFacts
  health: Health | undefined
  kids?: number
  showLag?: boolean
  /** Shown under the "Ethereum caught up" step while it's the current one. */
  speedUp?: ReactNode
}) {
  const { deployment } = useBridge()
  const now = useWallClock()
  const at = JOURNEY_AT[facts.stage]
  // Hs unknown: it's somewhere in steps 2–3 and we don't guess which
  const current = facts.stage === 'crossing' ? [1, 2] : [at]
  // stale numbers (a failed read, or hours behind) aren't worth quoting
  const lag =
    showLag && health && !health.stale && health.lagBlocks > 0 ? `Ethereum is ${aboutMinutes(health.lagMinutes)} behind the Hub.` : null
  const one = kids === 1

  // COPY: stage list details
  const items: { detail: ReactNode; live?: ReactNode }[] = [
    {
      detail: facts.sendTx ? (
        <>
          Locked in the Hub escrow ·{' '}
          <ExtLink className="mono nowrap" href={deployment.explorer.hubTx(facts.sendTx)}>
            {shortHash(facts.sendTx)}
          </ExtLink>
        </>
      ) : at > 0 ? (
        'Locked in the Hub escrow.'
      ) : (
        'Waiting for the Hub to confirm the send.'
      ),
    },
    {
      detail: 'Ethereum updates its view of the Hub every so often.',
      live:
        facts.stage === 'crossing' ? (
          <>
            We couldn't find the send transaction, so we can't tell which of these two steps it's on. {lag}
          </>
        ) : facts.blocksToGo !== undefined ? (
          <>
            Ethereum client is behind {blocks(facts.blocksToGo)}. {lag}
          </>
        ) : (
          lag
        ),
    },
    {
      detail: 'A prover shows Ethereum the kid left the Hub. Nobody has to trust it.',
      live: (() => {
        const seen = provingSeen(facts.provingSince, now)
        if (!seen) return null
        return (
          <>
            {seen}{' '}
            {facts.stuck && (
              <>
                {one ? 'This kid is' : 'Your kids are'} safe in the escrow and will cross when a prover picks {one ? 'it' : 'them'} up.{' '}
              </>
            )}
            {!deployment.demo && (
              <span className="secondary">
                {facts.stuck ? 'Or use' : 'You can use'} "Prove it yourself" above to do it now, from your wallet.
              </span>
            )}
            {/* COPY: proving-for-a-while note */}
          </>
        )
      })(),
    },
    {
      detail: 'Anyone can claim it, and it always lands at the address it was sent to.',
      live: facts.stage === 'ready' ? 'Proven and ready to claim.' : null,
    },
  ]

  return (
    <ol className="stages">
      {items.map((item, i) => {
        const state = i < at && !current.includes(i) ? 'done' : current.includes(i) ? 'now' : ''
        const outOfSync = i === 1 && state === 'now' && facts.blocksToGo !== undefined && facts.blocksToGo > 0
        return (
          <li key={JOURNEY[i]} className={state} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="tick" aria-hidden="true">
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span>
              <b>
                {outOfSync ? OUT_OF_SYNC : i === 2 && state === 'now' ? PROVING : JOURNEY[i]}
                {state && <span className="sr-only">{state === 'done' ? ' (done)' : ' (happening now)'}</span>}
              </b>
              <span className="d">{item.detail}</span>
              {state === 'now' && item.live && <span className="d live">{item.live}</span>}
              {state === 'now' && i === 1 && speedUp}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** The tracker's four crayon segments, the same four steps as the stage list. Decorative: the pill says the same. */
export function TrackBar({ stage }: { stage: Stage }) {
  const cur = JOURNEY_AT[stage]
  return (
    <div className="trackbar" aria-hidden="true">
      <div className="track">
        {TRACK_LABELS.map((l, i) => (
          <span key={l} className={i < cur ? 'on' : i === cur ? 'cur' : undefined} />
        ))}
      </div>
      <div className="track-labels">
        {TRACK_LABELS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  )
}
