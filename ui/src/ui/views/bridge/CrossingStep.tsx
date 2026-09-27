import type { BridgeError } from '../../../chain/types'
import { href } from '../../../router'
import { useHealth } from '../../../trips/hooks'
import type { Trip } from '../../../trips/types'
import { ErrorNote } from '../../ErrorNote'
import { aboutMinutes, blockNumber, kidWord } from '../../format'
import { Scene } from '../../Scene'
import { StageList } from '../../StageList'
import { slowestStage, STAGE_PROGRESS } from '../../stages'
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
  const tracker = href({ name: 'kids', address: sent.recipient })
  return (
    <>
      <h2 tabIndex={-1}>Crossing the bridge…</h2>
      <p className="lede">
        {h && !h.stale ? (
          h.lagMinutes < 1 ? (
            <>
              Right now Ethereum is <span className="hl">all caught up</span> with the Hub.{' '}
            </>
          ) : (
            <>
              Right now Ethereum is <span className="hl">{aboutMinutes(h.lagMinutes)}</span> behind the Hub.{' '}
            </>
          )
        ) : null}
        Close this tab if you like. Your {kidWord(n)} will be waiting under <a href={tracker}>My kids</a>.
        {/* COPY: crossing lede */}
      </p>
      <Scene ids={sent.ids} stage={stage} />
      {error && <ErrorNote error={error} action="read" onRetry={onRetry} live={false} />}
      <StageList facts={facts} health={h} />
      <div className="row">
        {h && (
          <span className="muted mono">
            Hub block {blockNumber(h.hubHeight)} · Ethereum has seen {blockNumber(h.clientHeight)}
          </span>
        )}
        <a className="btn ghost" href={tracker}>
          Track them
        </a>
      </div>
      <p className="note">
        You can close this tab: your {kidWord(n)} keep crossing without it. Come back to{' '}
        <a href={tracker}>this link</a> from any device to claim.
        {/* COPY: close-the-tab note */}
      </p>
    </>
  )
}
