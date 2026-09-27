import { useBridge } from '../../chain/context'
import type { KidId } from '../../chain/types'
import { href } from '../../router'
import { useHealth, useTrip } from '../../trips/hooks'
import { ClaimButton, useClaimFlow } from '../Claim'
import { Card } from '../chrome/Card'
import { ErrorNote } from '../ErrorNote'
import { blockNumber, dateTime, shortAddress, shortHash } from '../format'
import { KidArt } from '../KidArt'
import { ShareLink } from '../ShareLink'
import { StageList, TrackBar } from '../StageList'
import { STAGE_PILL } from '../stages'
import { SwitchChain } from '../SwitchChain'
import './tracker.css'

// One kid's trip, for anyone: the owner, a friend holding a share link, or a curious stranger.

const LEDE: Readonly<Record<string, string>> = {
  'home-hub': "Still on the Cosmos Hub. It hasn't been sent across.",
  locked: "Locked in the Hub escrow, waiting for Ethereum to catch up.",
  'catching-up': 'On the bridge: waiting for Ethereum to catch up to the Hub.',
  crossing: 'On the bridge.',
  proving: 'On the bridge: the proof is being made.',
  ready: 'Made it across! The proof landed on Ethereum, so it can be claimed.',
  'home-eth': 'Home on Ethereum.',
}

export function KidView({ id }: { id: KidId }) {
  const { deployment, hubWallet, ethWallet } = useBridge()
  const trip = useTrip(id)
  const health = useHealth()
  const claim = useClaimFlow()
  const t = trip.data
  const { explorer } = deployment
  const sent = t && t.stage !== 'home-hub'
  const opensea = t?.stage === 'home-eth' ? explorer.opensea(id) : null
  const token = t?.stage === 'home-eth' ? explorer.ethToken(id) : null

  return (
    <Card>
      <div className="kid-head">
        <KidArt id={id} size={110} eager />
        <div>
          <h2 tabIndex={-1}>#{id}</h2>
          {t && <span className={STAGE_PILL[t.stage].className}>{STAGE_PILL[t.stage].label}</span>}
        </div>
      </div>

      {!t && trip.error && <ErrorNote error={trip.error} action="read" onRetry={trip.refetch} live={false} />}
      {!t && !trip.error && (
        <p className="muted" role="status">
          Looking for #{id}…
        </p>
      )}

      {t && trip.error && <ErrorNote error={trip.error} action="read" onRetry={trip.refetch} live={false} />}
      {t && (
        <>
          <p className="lede">
            {LEDE[t.stage]}
            {t.stage === 'home-hub' && hubWallet.status === 'connected' && (
              <>
                {' '}
                If it's yours, send it from <a href="#/">Bridge a kid</a>.
              </>
            )}
          </p>
          {sent && <TrackBar stage={t.stage} />}
          {t.stage === 'ready' && (
            <div className="row start">
              <ClaimButton ids={[id]} flow={claim}>
                {`Claim #${id}`}
              </ClaimButton>
              <span className="hint">Anyone can claim; it always goes to {t.recipient ? shortAddress(t.recipient) : 'its recipient'}.</span>
            </div>
          )}
          {t.stage === 'ready' && ethWallet.wrongChain && <SwitchChain />}
          {claim.failure && <ErrorNote error={claim.failure.error} action="claim" walletName={ethWallet.walletName} tokenId={id} />}
          {sent && <StageList facts={t} health={health.data} />}

          <dl className="facts">
            {t.recipient && (
              <>
                <dt>Headed to</dt>
                <dd>
                  <a className="mono" href={explorer.ethAddress(t.recipient)} target="_blank" rel="noopener">
                    {t.recipient} ↗
                  </a>
                  <br />
                  <a href={href({ name: 'kids', address: t.recipient })}>Every kid headed there</a>
                </dd>
              </>
            )}
            {t.sendTx && (
              <>
                <dt>Sent</dt>
                <dd>
                  {t.sentAt && <>{dateTime(t.sentAt)} · </>}
                  <a className="mono" href={explorer.hubTx(t.sendTx)} target="_blank" rel="noopener">
                    {shortHash(t.sendTx)} ↗
                  </a>
                  {t.sendHeight !== undefined && <> · Hub block {blockNumber(t.sendHeight)}</>}
                </dd>
              </>
            )}
            {t.sender && (
              <>
                <dt>Sent by</dt>
                <dd>
                  <a className="mono" href={explorer.hubAccount(t.sender)} target="_blank" rel="noopener">
                    {shortAddress(t.sender)} ↗
                  </a>
                </dd>
              </>
            )}
            {t.owner && (
              <>
                <dt>Owner now</dt>
                <dd>
                  <a className="mono" href={explorer.ethAddress(t.owner)} target="_blank" rel="noopener">
                    {t.owner} ↗
                  </a>
                  {t.recipient && t.owner.toLowerCase() !== t.recipient.toLowerCase() && (
                    <span className="hint"> (it changed hands after landing)</span>
                  )}
                </dd>
              </>
            )}
          </dl>

          {(token || opensea) && (
            <div className="row start">
              {token && (
                <a className="btn ghost" href={token} target="_blank" rel="noopener">
                  Etherscan ↗
                </a>
              )}
              {opensea && (
                <a className="btn ghost" href={opensea} target="_blank" rel="noopener">
                  OpenSea ↗
                </a>
              )}
            </div>
          )}
        </>
      )}

      <div className="row foot">
        <a href="#/kids">← All my kids</a>
        <ShareLink hash={href({ name: 'kid', id })} />
      </div>
    </Card>
  )
}
