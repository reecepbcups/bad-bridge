import type { BridgeError } from '../../../chain/types'
import { href } from '../../../router'
import { useHealth } from '../../../trips/hooks'
import type { Trip } from '../../../trips/types'
import { ErrorNote } from '../../ErrorNote'
import { aboutMinutes, blockNumber, kidWord } from '../../format'
import { Scene } from '../../Scene'
import { ShareLink } from '../../ShareLink'
import { SpeedUp } from '../../SpeedUp'
import { StageList } from '../../StageList'
import { lowerFirst, slowestStage, STAGE_LINE, STAGE_PROGRESS } from '../../stages'
import { useTitle } from '../../useTitle'
import type { SentTrip } from './flow'

/** The kids are on the bridge. Everything shown here is read from chain on every refresh. */
export function CrossingStep({
  sent,
  trips,
  error,
  onRetry,
}: {
  sent: SentTrip
  trips: readonly Trip[]
  error: BridgeError | null
  onRetry: () => void
}) {
  useTitle('Crossing…')
  const health = useHealth({ live: true })
  const n = sent.ids.length
  const stage = slowestStage(trips) ?? 'locked'
  // the slowest kid speaks for the group; they were sent in one tx, so they normally move together
  const lead = trips.find((t) => t.stage === stage)
  const facts = {
    stage,
    sendTx: lead?.sendTx ?? sent.txHash,
    blocksToGo: lead?.blocksToGo,
    stuck: trips.some((t) => t.stuck && STAGE_PROGRESS[t.stage] === STAGE_PROGRESS[stage]),
    provingSince: lead?.provingSince,
  }
  const h = health.data
  const caughtUp = STAGE_PROGRESS[stage] >= STAGE_PROGRESS.proving
  const tracker = href({ name: 'kids', address: sent.recipient })
  return (
    <>
      <h2 tabIndex={-1}>Crossing the bridge…</h2>
      <p className="lede">
        {caughtUp ? (
          <>Ethereum has caught up; now the proof is being made. </>
        ) : h && !h.stale ? (
          h.lagMinutes < 1 ? (
            <>Right now Ethereum is almost caught up with the Hub. </>
          ) : (
            <>
              Right now Ethereum is <span className="hl">{aboutMinutes(h.lagMinutes)}</span> behind the Hub.{' '}
            </>
          )
        ) : null}
        Close this tab if you like. Your {kidWord(n)} will be waiting under <a href={tracker}>My kids</a>.
        {/* COPY: crossing lede */}
      </p>
      <p className="sr-only" role="status">
        Now: {lowerFirst(STAGE_LINE[stage])}
      </p>
      <Scene ids={sent.ids} stage={stage} />
      {error && <ErrorNote error={error} action="read" onRetry={onRetry} live={false} />}
      {/* the lede already says how far behind Ethereum is */}
      <StageList facts={facts} health={h} kids={n} showLag={false} />
      {h && (
        <p className="muted mono heights">
          Hub block {blockNumber(h.hubHeight)} · Ethereum has seen {blockNumber(h.clientHeight)}
        </p>
      )}
      {!caughtUp && <SpeedUp recipient={sent.recipient} n={n} />}
      <div className="row start">
        <a className="btn ghost" href={tracker}>
          Track them
        </a>
        <ShareLink hash={tracker} label="Copy a link to check later" />
      </div>
    </>
  )
}
