import { useState } from 'react'
import { useBridge } from '../../chain/context'
import { checkRecipient } from '../../chain/eth/recipient'
import { navigate } from '../../router'
import { useClaimKids, useTrips } from '../../trips/hooks'
import type { Trip, TripQuery } from '../../trips/types'
import { Card } from '../chrome/Card'
import { KidArt } from '../KidArt'
import { STAGE_LINE, STAGE_PILL } from '../stages'
import './tracker.css'

// Phase 0 placeholder for the tracker: lookup, summary pills and a plain list over useTrips().

function queryFor(address: string | undefined): TripQuery {
  if (!address) return {}
  if (address.startsWith('0x')) {
    const check = checkRecipient(address)
    return check.ok ? { eth: check.address } : {}
  }
  return address.startsWith('cosmos1') ? { hub: address } : {}
}

export function KidsView({ address }: { address?: string }) {
  const { ethWallet } = useBridge()
  const target = address ?? (ethWallet.status === 'connected' ? ethWallet.address : undefined)
  const trips = useTrips(queryFor(target))
  const list = trips.data ?? []
  const count = (pred: (t: Trip) => boolean) => list.filter(pred).length
  const ready = count((t) => t.stage === 'ready')
  const home = count((t) => t.stage === 'home-eth')
  const crossing = list.length - ready - home

  return (
    <Card>
      <h2>My kids</h2>
      <p className="lede">Every kid headed to your Ethereum address, wherever it is on the bridge.</p>
      <Lookup key={target ?? ''} initial={target ?? ''} />
      {list.length > 0 && (
        <div className="summary">
          {crossing > 0 && <span className="pill crossing">{crossing} crossing</span>}
          {ready > 0 && <span className="pill ready">{ready} ready</span>}
          {home > 0 && <span className="pill home">{home} home</span>}
        </div>
      )}
      {trips.error && <p className="hint bad">Couldn't look that up ({trips.error.code}).</p>}
      {target && trips.data && list.length === 0 && <p className="muted">No kids found for that address yet.</p>}
      <ul className="list">
        {list.map((t) => (
          <TripRow key={t.tokenId} trip={t} />
        ))}
      </ul>
      <p className="note">Found by your Ethereum address, so it works from any device. Checks again every 30 seconds.</p>
    </Card>
  )
}

function Lookup({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return (
    <form
      className="lookup"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) navigate({ name: 'kids', address: value.trim() })
      }}
    >
      <label className="sr-only" htmlFor="lookup">
        Ethereum or Hub address
      </label>
      <input
        type="text"
        id="lookup"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        placeholder="0x… or cosmos1…"
      />
      <button type="submit" className="btn ghost">
        Look up
      </button>
    </form>
  )
}

function TripRow({ trip }: { trip: Trip }) {
  const pill = STAGE_PILL[trip.stage]
  const claim = useClaimKids()
  return (
    <li className="item">
      <KidArt id={trip.tokenId} size={72} />
      <div className="top">
        <a className="id" href={`#/kid/${trip.tokenId}`}>
          #{trip.tokenId}
        </a>
        <span className={pill.className}>{pill.label}</span>
      </div>
      <div className="act">
        {trip.stage === 'ready' && (
          <button
            type="button"
            className="btn eth"
            disabled={claim.status === 'pending'}
            onClick={() => claim.run([trip.tokenId]).catch(() => undefined)}
          >
            {claim.status === 'pending' ? 'Check wallet…' : 'Claim'}
          </button>
        )}
      </div>
      <div className="meta" style={{ gridColumn: '2 / -1' }}>
        {STAGE_LINE[trip.stage]}
        {trip.stuck && ' · the batcher looks stuck'}
        {claim.error && ` · claim failed (${claim.error.code})`}
      </div>
    </li>
  )
}
