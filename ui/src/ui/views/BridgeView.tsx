import { useState } from 'react'
import { useBridge } from '../../chain/context'
import type { KidId } from '../../chain/types'
import { useOwnedKids } from '../../trips/hooks'
import type { Trip } from '../../trips/types'
import { Card } from '../chrome/Card'
import { Stepper } from '../chrome/Stepper'
import { kidWord } from '../format'
import { KidArt } from '../KidArt'
import './bridge.css'

// Phase 0 placeholder: the pick screen over real hook data. The UI workstream builds the full flow
// (pick → review → crossing → claim → done) and drives the stepper from it.

export function BridgeView() {
  const { hubWallet } = useBridge()
  const owned = useOwnedKids()
  const [picked, setPicked] = useState<ReadonlySet<KidId>>(new Set())
  const n = picked.size
  const toggle = (id: KidId) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <>
      <Stepper current={0} />
      <Card>
        <h2>Who's crossing?</h2>
        <p className="lede">These Bad Kids live in your Hub wallet. Pick the ones moving to Ethereum.</p>
        {hubWallet.status !== 'connected' ? (
          <p className="muted">Connect your Hub wallet to see your kids.</p>
        ) : owned.error ? (
          <p className="hint bad">Couldn't load your kids ({owned.error.code}).</p>
        ) : !owned.data ? (
          <p className="muted">Looking for your kids…</p>
        ) : (
          <div className="kids">
            {owned.data.map((trip) => (
              <KidTile key={trip.tokenId} trip={trip} picked={picked.has(trip.tokenId)} onToggle={toggle} />
            ))}
          </div>
        )}
        <div className="row">
          <span className="muted">{n ? `${n} ${kidWord(n)} picked` : 'Pick at least one kid'}</span>
          <button type="button" className="btn" disabled={n === 0}>
            Next →
          </button>
        </div>
      </Card>
    </>
  )
}

function KidTile({ trip, picked, onToggle }: { trip: Trip; picked: boolean; onToggle: (id: KidId) => void }) {
  const home = trip.stage === 'home-hub'
  const sub = home ? 'on the Hub' : trip.sentAt ? `crossed ${shortDate(trip.sentAt)}` : 'crossing'
  return (
    <button type="button" className="kid" aria-pressed={picked} disabled={!home} onClick={() => onToggle(trip.tokenId)}>
      <KidArt id={trip.tokenId} />
      <span className="name">#{trip.tokenId}</span>
      <span className="sub">{sub}</span>
    </button>
  )
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
