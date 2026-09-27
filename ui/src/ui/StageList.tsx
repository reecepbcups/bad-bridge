import type { ReactNode } from 'react'
import { useBridge } from '../chain/context'
import type { Health, Stage } from '../trips/types'
import { aboutMinutes, blocks, shortHash } from './format'
import { useWallClock } from './hooks'
import { LIST_AT, TRACK_AT, TRACK_LABELS } from './stages'

/** What the stage list needs to know about a trip (or a group of kids sent in one tx). */
export interface StageFacts {
  stage: Stage
  sendTx?: string
  blocksToGo?: number
  stuck: boolean
  /** proving: when it was first seen proving. */
  provingSince?: Date
}

/** The mockup's four-step crossing list, with live details on the current step. */
export function StageList({ facts, health }: { facts: StageFacts; health: Health | undefined }) {
  const { deployment } = useBridge()
  const now = useWallClock()
  const at = LIST_AT[facts.stage]
  // Hs unknown: it's somewhere in steps 2–3 and we don't guess which
  const current = facts.stage === 'crossing' ? [1, 2] : [at]
  // stale numbers (a failed read, or hours behind) aren't worth quoting
  const lag = health && !health.stale && health.lagBlocks > 0 ? `Ethereum is ${aboutMinutes(health.lagMinutes)} behind the Hub.` : null

  const items: { title: string; detail: ReactNode; live?: ReactNode }[] = [
    {
      title: 'Locked in the Hub escrow',
      detail: facts.sendTx ? (
        <>
          send_nft confirmed ·{' '}
          <a className="mono" href={deployment.explorer.hubTx(facts.sendTx)} target="_blank" rel="noopener">
            {shortHash(facts.sendTx)} ↗
          </a>
        </>
      ) : at > 0 ? (
        'The escrow has it.'
      ) : (
        'Waiting for the Hub to confirm the send.'
      ),
    },
    {
      title: 'Ethereum catches up to the Hub',
      detail: "Ethereum's view of the Hub moves forward whenever Eureka relays a transfer.",
      live:
        facts.stage === 'crossing' ? (
          <>
            We couldn't find the send transaction, so we can't tell which of these two steps it's on. {lag}
          </>
        ) : facts.blocksToGo !== undefined ? (
          <>
            {blocks(facts.blocksToGo)} to go. {lag}
          </>
        ) : (
          lag
        ),
    },
    {
      title: 'Making the proof',
      detail: 'The batcher proves the kid left the Hub. Nobody has to trust it.',
      live: facts.stuck ? (
        <>
          The prover looks slow right now. It can't lie, it can only stall, and anyone can run one.{' '}
          <a href={`${deployment.sourceUrl}#readme`} target="_blank" rel="noopener">
            How to run a prover ↗
          </a>
          {/* COPY: stuck prover note */}
        </>
      ) : facts.provingSince ? (
        `Proving for ${aboutMinutes((now - facts.provingSince.getTime()) / 60_000).replace(/^about /, '')} so far.`
      ) : null,
    },
    {
      title: 'Proof lands on Ethereum',
      detail: "Checked on-chain against the Hub's state. Then it can be claimed.",
    },
  ]

  return (
    <ol className="stages">
      {items.map((item, i) => {
        const state = i < at && !current.includes(i) ? 'done' : current.includes(i) ? 'now' : ''
        return (
          <li key={item.title} className={state} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="tick" aria-hidden="true">
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span>
              <b>
                {item.title}
                {state && <span className="sr-only">{state === 'done' ? ' (done)' : ' (happening now)'}</span>}
              </b>
              <span className="d">{item.detail}</span>
              {state === 'now' && item.live && <span className="d live">{item.live}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** The tracker's four crayon segments: Sent, Seen, Proven, Claimed. Decorative: the pill says the same. */
export function TrackBar({ stage }: { stage: Stage }) {
  const cur = TRACK_AT[stage]
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
