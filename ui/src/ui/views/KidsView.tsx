import { useId, useState } from 'react'
import { useBridge } from '../../chain/context'
import { href, navigate } from '../../router'
import { POLL_MS, useHealth, useRememberedTrips, useTrips } from '../../trips/hooks'
import type { Health, Trip, TripQuery } from '../../trips/types'
import { ClaimButton, useClaimFlow, type ClaimFlow } from '../Claim'
import { Card } from '../chrome/Card'
import { ErrorNote } from '../ErrorNote'
import { dateTime, shortAddress, timeAgo } from '../format'
import { useHubNow } from '../hooks'
import { KidArt, KidDoodle } from '../KidArt'
import { parseLookup, type Lookup } from '../lookup'
import { ShareLink } from '../ShareLink'
import { StageList, TrackBar } from '../StageList'
import { inFlight, STAGE_LINE, STAGE_PILL } from '../stages'
import { SwitchChain } from '../SwitchChain'
import './tracker.css'

// The tracker: every kid headed to an address (or sent by one), wherever it is on the bridge.
// #/kids uses the connected wallets plus kids this browser sent; #/kids/<address> looks one address up.

export function KidsView({ address }: { address?: string }) {
  const { deployment, hubWallet, ethWallet } = useBridge()
  const remembered = useRememberedTrips()
  const connectedEth = ethWallet.status === 'connected' ? ethWallet.address : undefined
  const connectedHub = hubWallet.status === 'connected' ? hubWallet.address : undefined

  const lookup: Lookup | null = address ? parseLookup(address, deployment.hub.bech32Prefix) : null
  const query: TripQuery = lookup
    ? lookup.kind === 'eth'
      ? { eth: lookup.address }
      : lookup.kind === 'hub'
        ? { hub: lookup.address }
        : {}
    : { eth: connectedEth, hub: connectedHub, ids: remembered.length > 0 ? remembered : undefined }
  const active = Boolean(query.eth || query.hub || query.ids?.length)
  const trips = useTrips(query)
  const health = useHealth()
  const claim = useClaimFlow()

  const target = lookup && (lookup.kind === 'eth' || lookup.kind === 'hub') ? lookup.address : null
  const mine = !target || [connectedEth, connectedHub].some((a) => a?.toLowerCase() === target.toLowerCase())
  const shareAddress = target ?? connectedEth ?? connectedHub

  const list = trips.data ?? []
  const ready = list.filter((t) => t.stage === 'ready')
  const home = list.filter((t) => t.stage === 'home-eth').length
  const crossing = list.filter((t) => inFlight(t.stage)).length

  return (
    <Card>
      <h2 tabIndex={-1}>{mine ? 'My kids' : `Kids for ${shortAddress(target ?? '')}`}</h2>
      <p className="lede">
        {lookup?.kind === 'hub'
          ? 'Every kid this Hub address sent, wherever it is on the bridge.'
          : mine
            ? 'Every kid headed to your Ethereum address, wherever it is on the bridge.'
            : 'Every kid headed to this Ethereum address, wherever it is on the bridge.'}
      </p>
      <LookupBox initial={address ?? connectedEth ?? ''} />

      {lookup?.kind === 'bad' && (
        <p className="hint bad" role="alert">
          {lookup.message}
        </p>
      )}

      {!active && lookup?.kind !== 'bad' && (
        <div className="empty">
          <KidDoodle id={3} />
          <div>
            <b>Who are we looking for?</b>
            <span>Connect a wallet, or paste an Ethereum address, a Hub address or a kid number above.</span>
          </div>
        </div>
      )}

      {active && !trips.data && trips.error && (
        <ErrorNote error={trips.error} action="read" onRetry={trips.refetch} live={false} />
      )}
      {active && !trips.data && !trips.error && <LoadingRows />}

      {trips.data && list.length === 0 && (
        <div className="empty">
          <KidDoodle id={5} />
          <div>
            <b>No kids on the bridge {lookup ? 'for this address' : 'yet'}</b>
            <span>
              {mine ? (
                <>
                  Nothing headed here yet. Send one from <a href="#/">Bridge a kid</a>.
                </>
              ) : (
                'Nothing has been sent to or from this address.'
              )}
            </span>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <>
          <div className="row">
            <div className="summary">
              {crossing > 0 && <span className="pill crossing">{crossing} crossing</span>}
              {ready.length > 0 && <span className="pill ready">{ready.length} ready</span>}
              {home > 0 && <span className="pill home">{home} home</span>}
            </div>
            {ready.length > 1 && (
              <ClaimButton ids={ready.map((t) => t.tokenId)} flow={claim}>
                {`Claim all ${ready.length}`}
              </ClaimButton>
            )}
          </div>
          {ready.length > 0 && ethWallet.wrongChain && <SwitchChain />}
          {ready.length > 0 && !ethWallet.wrongChain && ethWallet.status !== 'connected' && (
            <p className="hint">Connect an Ethereum wallet to claim. Anyone can claim: kids always land at the address they were sent to.</p>
          )}
          {claim.failure && (
            <ErrorNote
              error={claim.failure.error}
              action="claim"
              walletName={ethWallet.walletName}
              tokenId={claim.failure.ids.length === 1 ? claim.failure.ids[0] : undefined}
            />
          )}
          {trips.error && <ErrorNote error={trips.error} action="read" onRetry={trips.refetch} live={false} />}
          <ul className="list" aria-label="Kids on the bridge">
            {list.map((t) => (
              <TripRow key={t.tokenId} trip={t} health={health.data} claim={claim} />
            ))}
          </ul>
        </>
      )}

      <div className="row foot">
        <p className="note">
          {foundBy(lookup, mine, connectedEth, connectedHub)} Checks again every {Math.round(POLL_MS / 1000)} seconds.
        </p>
        {shareAddress && <ShareLink hash={href({ name: 'kids', address: shareAddress })} />}
      </div>
    </Card>
  )
}

// COPY: tracker footnote
/** How the list was found, so nobody's told a stranger's address is theirs. */
function foundBy(lookup: Lookup | null, mine: boolean, eth: string | undefined, hub: string | undefined): string {
  const anywhere = 'so it works from any device.'
  if (lookup?.kind === 'hub') return `Found by ${mine ? 'your ' : ''}Hub address, ${anywhere}`
  if (lookup?.kind === 'eth') return `Found by ${mine ? 'your ' : ''}Ethereum address, ${anywhere}`
  if (eth) return `Found by your Ethereum address, ${anywhere}`
  if (hub) return `Found by your Hub address, ${anywhere}`
  return 'Kids sent from this browser. Look up an address to see them from any device.'
}

function LookupBox({ initial }: { initial: string }) {
  const { deployment } = useBridge()
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = useId()
  return (
    <form
      className="lookup"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = parseLookup(value, deployment.hub.bech32Prefix)
        if (parsed.kind === 'bad') return setError(parsed.message)
        setError(null)
        navigate(parsed.kind === 'kid' ? { name: 'kid', id: parsed.id } : { name: 'kids', address: parsed.address })
      }}
    >
      <label className="sr-only" htmlFor={inputId}>
        Ethereum address, Hub address or kid number
      </label>
      <input
        type="text"
        id={inputId}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        placeholder="0x…, cosmos1… or #1234"
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
      />
      <button type="submit" className="btn ghost">
        Look up
      </button>
      {error && (
        <p className="hint bad full" id={errorId} role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

function LoadingRows() {
  return (
    <>
      <p className="sr-only" role="status">
        Looking for kids…
      </p>
      <ul className="list" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="item skeleton">
            <span className="art" />
            <span className="bar" />
            <span className="bar short" />
          </li>
        ))}
      </ul>
    </>
  )
}

export function TripRow({ trip, health, claim }: { trip: Trip; health: Health | undefined; claim: ClaimFlow }) {
  const { deployment } = useBridge()
  const hubNow = useHubNow()
  const pill = STAGE_PILL[trip.stage]
  const token = trip.stage === 'home-eth' ? deployment.explorer.ethToken(trip.tokenId) : null
  const sent = trip.sentAt ? `Sent ${sentWhen(trip.sentAt, hubNow)}` : null
  const line = [sent, STAGE_LINE[trip.stage], trip.stuck ? 'the prover looks slow' : null].filter(Boolean).join(' · ')
  return (
    <li className="item">
      <KidArt id={trip.tokenId} size={72} decorative />
      <div className="top">
        <a className="id" href={href({ name: 'kid', id: trip.tokenId })}>
          #{trip.tokenId}
        </a>
        <span className={pill.className}>{pill.label}</span>
      </div>
      <div className="act">
        {trip.stage === 'ready' && (
          <ClaimButton ids={[trip.tokenId]} flow={claim}>
            Claim
          </ClaimButton>
        )}
        {token && (
          <a className="btn ghost" href={token} target="_blank" rel="noopener" aria-label={`View #${trip.tokenId} on Etherscan`}>
            View ↗
          </a>
        )}
      </div>
      <div className="info">
        <TrackBar stage={trip.stage} />
        <div className="meta">{line}</div>
      </div>
      {inFlight(trip.stage) && (
        <details>
          <summary>What's happening?</summary>
          <StageList facts={trip} health={health} />
        </details>
      )}
    </li>
  )
}

/** "22 min ago" for recent sends, "Sep 26, 9:12 pm" for older ones. */
function sentWhen(at: Date, now: Date | undefined): string {
  if (!now) return dateTime(at)
  const recent = now.getTime() - at.getTime() < 3 * 3_600_000
  return recent ? timeAgo(at, now) : dateTime(at)
}

