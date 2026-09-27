import { useState } from 'react'
import { useBridge } from '../../../chain/context'
import type { KidId } from '../../../chain/types'
import { isLive } from '../../../config/deployments'
import { useOwnedKids, useRememberedTrips, useTrips } from '../../../trips/hooks'
import type { Trip } from '../../../trips/types'
import { CHAIN_NAME, WalletOptions } from '../../Connect'
import { ErrorNote } from '../../ErrorNote'
import { kidWord, shortDate } from '../../format'
import { KidArt, KidDoodle } from '../../KidArt'
import { inFlight } from '../../stages'
import { useFlow } from './flow'

/** How many tiles to show before "show more". */
export const PAGE = 60

export function PickStep() {
  const { deployment, hubWallet } = useBridge()
  if (!isLive(deployment)) return <NotLive />
  return (
    <>
      <h2 tabIndex={-1}>Who's crossing?</h2>
      <p className="lede">These Bad Kids live in your Hub wallet. Pick the ones moving to Ethereum.</p>
      <CrossingNudge />
      {hubWallet.status === 'connected' ? <KidPicker /> : <ConnectHub />}
    </>
  )
}

function NotLive() {
  const { deployment } = useBridge()
  return (
    <>
      <h2 tabIndex={-1}>The bridge isn't open yet</h2>
      <p className="lede">
        {deployment.collectionName} can't cross until the Hub escrow and the Ethereum contract are deployed. Nothing to do
        yet: your kids are safe where they are.
        {/* COPY: not-live state */}
      </p>
      <div className="celebrate" aria-hidden="true">
        <KidDoodle id={11} />
        <KidDoodle id={22} />
        <KidDoodle id={30} />
      </div>
      <p className="muted">
        Meanwhile, read <a href="#/about">how it works</a>.
      </p>
    </>
  )
}

function ConnectHub() {
  return (
    <div className="connect-inline">
      <p className="muted">Connect your {CHAIN_NAME.hub} wallet to see your kids.</p>
      <WalletOptions chain="hub" />
    </div>
  )
}

/** Kids this browser sent that are still on their way: a link back to them after a reload. */
function CrossingNudge() {
  const remembered = useRememberedTrips()
  const trips = useTrips({ ids: remembered })
  const list = trips.data ?? []
  const crossing = list.filter((t) => inFlight(t.stage)).length
  const ready = list.filter((t) => t.stage === 'ready').length
  if (crossing === 0 && ready === 0) return null
  const parts = [crossing > 0 && `${crossing} ${kidWord(crossing)} crossing`, ready > 0 && `${ready} ready to claim`].filter(Boolean)
  return (
    <p className="note nudge">
      {parts.join(' · ')} <a href="#/kids">→ track them</a>
    </p>
  )
}

function KidPicker() {
  const { deployment, hubWallet } = useBridge()
  const owned = useOwnedKids()
  const { flow, update } = useFlow()
  const [limit, setLimit] = useState(PAGE)

  const kids = owned.data
  const pickable = new Set((kids ?? []).filter((t) => t.stage === 'home-hub').map((t) => t.tokenId))
  // a picked kid that left (sent from elsewhere) drops out of the pick
  const picked = kids ? flow.picked.filter((id) => pickable.has(id)) : flow.picked
  const n = picked.length

  const toggle = (id: KidId) =>
    update((f) => ({ picked: f.picked.includes(id) ? f.picked.filter((p) => p !== id) : [...f.picked, id] }))

  if (!kids) {
    if (owned.error) return <ErrorNote error={owned.error} action="read" onRetry={owned.refetch} />
    return (
      <>
        <p className="sr-only" role="status">
          Looking for your kids…
        </p>
        <div className="kids" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="kid skeleton">
              <span className="art" />
              <span className="name">&nbsp;</span>
              <span className="sub">&nbsp;</span>
            </span>
          ))}
        </div>
      </>
    )
  }

  if (kids.length === 0) {
    return (
      <div className="empty">
        <KidDoodle id={7} />
        <div>
          <b>No {deployment.collectionName} in this wallet</b>
          <span>
            {hubWallet.walletName ?? 'Your wallet'} doesn't hold any on the Cosmos Hub. Using another account? Switch it in
            your wallet and this list updates.
            {/* COPY: empty wallet */}
          </span>
        </div>
      </div>
    )
  }

  const shown = kids.slice(0, limit)
  const rest = kids.length - shown.length
  return (
    <>
      {owned.error && <ErrorNote error={owned.error} action="read" onRetry={owned.refetch} live={false} />}
      <div className="kids" role="group" aria-label="Your kids">
        {shown.map((trip) => (
          <KidTile key={trip.tokenId} trip={trip} picked={picked.includes(trip.tokenId)} onToggle={toggle} />
        ))}
      </div>
      {rest > 0 && (
        <div className="row more-row">
          <button type="button" className="btn ghost" onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, rest)} more
          </button>
          <span className="muted">{rest} more in this wallet</span>
        </div>
      )}
      <div className="row">
        <span className="muted" aria-live="polite">
          {n ? `${n} ${kidWord(n)} picked` : 'Pick at least one kid'}
        </span>
        <button
          type="button"
          className="btn"
          disabled={n === 0}
          onClick={() => update({ step: 'review', picked })}
        >
          Next →
        </button>
      </div>
    </>
  )
}

function KidTile({ trip, picked, onToggle }: { trip: Trip; picked: boolean; onToggle: (id: KidId) => void }) {
  const home = trip.stage === 'home-hub'
  const sub = home
    ? 'on the Hub'
    : trip.stage === 'home-eth'
      ? trip.sentAt
        ? `crossed ${shortDate(trip.sentAt)}`
        : 'on Ethereum'
      : trip.stage === 'ready'
        ? 'ready to claim'
        : 'crossing'
  return (
    <button
      type="button"
      className="kid"
      aria-pressed={home ? picked : undefined}
      disabled={!home}
      onClick={() => onToggle(trip.tokenId)}
    >
      <KidArt id={trip.tokenId} decorative />
      <span className="name">#{trip.tokenId}</span>
      <span className="sub">{sub}</span>
    </button>
  )
}
