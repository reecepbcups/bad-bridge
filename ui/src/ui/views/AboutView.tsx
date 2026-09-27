import { useBridge } from '../../chain/context'
import { useConfigSanity, useHealth } from '../../trips/hooks'
import { Card } from '../chrome/Card'
import { aboutMinutes, blockNumber } from '../format'
import { useChangedAt, useWallClock } from '../hooks'
import { KidArt } from '../KidArt'
import './about.css'

// Ported from the mockup's About view, with the facts fixed: one signature sends any number of kids, one
// Ethereum tx claims any number, and waiting times are live instead of "20–60 minutes".
// Addresses come from the active deployment.

export function AboutView() {
  const { deployment } = useBridge()
  const health = useHealth()
  const { hub, eth, explorer } = deployment
  const source = deployment.sourceUrl.replace(/^https:\/\//, '')
  const lag = health.data && !health.data.stale ? aboutMinutes(health.data.lagMinutes) : null
  return (
    <Card>
      <div className="about">
        <h2 tabIndex={-1}>What's the Bad Bridge?</h2>
        <p className="lede">
          A one-way bridge that moves Bad Kids from the Cosmos Hub to Ethereum. Same kid, same number, same art, new home.
        </p>
        <div className="celebrate">
          {[4801, 663, 3838].map((id) => (
            <KidArt key={id} id={id} size={110} eager />
          ))}
        </div>

        <HealthStrip />

        <h3>How it works</h3>
        <ol className="how">
          <li>
            <span className="n">1</span>
            <span className="where hub">Cosmos Hub</span>
            <b>You send your kids</b>They go into an escrow on the Hub, along with the Ethereum address they should land at.
            One signature sends as many as you like.
            {/* COPY: how-it-works step 1 */}
          </li>
          <li>
            <span className="n">2</span>
            <span className="where mid">In between</span>
            <b>We prove they left</b>A zero-knowledge proof shows Ethereum that the kids really are locked on the Hub.
          </li>
          <li>
            <span className="n">3</span>
            <span className="where eth">Ethereum</span>
            <b>You claim them</b>The same kids, with the same numbers, get minted to your Ethereum address. One transaction
            claims them all.
            {/* COPY: how-it-works step 3 */}
          </li>
        </ol>

        <h3>Why you can trust it</h3>
        <ul className="trust">
          <li>
            <span>
              <b>Nobody can mint a fake kid.</b> Every kid on Ethereum is backed by a proof of the Hub's real state,
              checked against the light client that IBC Eureka already runs on Ethereum.
            </span>
          </li>
          <li>
            <span>
              <b>No admin keys.</b> The escrow has no admin and the Ethereum contract has no owner. Nobody can pause it,
              upgrade it or pull kids out.
            </span>
          </li>
          <li>
            <span>
              <b>The prover can't lie.</b> The worst it can do is stop. If that happens, anyone can run another one from
              the open source code.
            </span>
          </li>
        </ul>

        <h3>Good to know</h3>
        <div className="faq">
          <details>
            <summary>Why can't kids come back?</summary>
            <p>
              Going back would need the Hub to check proofs about Ethereum, and it can't do that today. Once a kid
              crosses, it stays on Ethereum.
            </p>
          </details>
          <details>
            <summary>Why does it take a while?</summary>
            <p>
              Ethereum only learns about new Hub blocks when IBC Eureka relays a transfer. After that, the prover bundles
              waiting kids into one proof. So the wait depends on how far behind Ethereum is
              {lag ? <>: right now that's {lag}.</> : '.'}
              {/* COPY: FAQ wait time */}
            </p>
          </details>
          <details>
            <summary>Does the art change?</summary>
            <p>No. The Ethereum kid points at the same IPFS folder as the Hub kid, so the picture and traits are identical.</p>
          </details>
          <details>
            <summary>What happens to the kid on the Hub?</summary>
            <p>It stays locked in the escrow forever. That's what makes the Ethereum kid the real one.</p>
          </details>
          <details>
            <summary>What does it cost?</summary>
            <p>
              One Hub transaction sends any number of kids, for a small ATOM fee. Then one Ethereum transaction claims
              them all, at roughly 79,000 gas per kid. The prover pays for the proof.
              {/* COPY: FAQ cost */}
            </p>
          </details>
          <details>
            <summary>Who can claim my kid?</summary>
            <p>
              Anyone. A claim always mints the kid to the address it was sent to, so it's safe for a friend (or a bot) to
              claim for you.
              {/* COPY: FAQ who can claim */}
            </p>
          </details>
          <details>
            <summary>Ethereum and Hub kids: are they the same?</summary>
            <p>
              Same number, same art, but they trade separately. An Ethereum kid trades on Ethereum marketplaces, not on
              Stargaze or other Hub marketplaces.
              {/* COPY: needs sign-off (trading disclosure) */}
            </p>
          </details>
          <details>
            <summary>I closed the tab. Where's my kid?</summary>
            <p>
              Open <a href="#/kids">My kids</a> and look up your Ethereum address, your Hub address or the kid's number.
              It works from any device.
            </p>
          </details>
        </div>

        <h3>Contracts</h3>
        <dl className="addrs">
          <dt>Escrow (Cosmos Hub)</dt>
          <dd>
            {hub.escrow ? (
              <a className="mono" href={explorer.hubContract(hub.escrow)} target="_blank" rel="noopener">
                {hub.escrow}
              </a>
            ) : (
              <span className="muted">not live yet</span>
            )}
          </dd>
          <dt>{deployment.collectionName} (Cosmos Hub)</dt>
          <dd>
            <a className="mono" href={explorer.hubContract(hub.cw721)} target="_blank" rel="noopener">
              {hub.cw721}
            </a>
          </dd>
          <dt>BadBridge (Ethereum)</dt>
          <dd>
            {eth.bridge ? (
              <a className="mono" href={explorer.ethAddress(eth.bridge)} target="_blank" rel="noopener">
                {eth.bridge}
              </a>
            ) : (
              <span className="muted">not live yet</span>
            )}
          </dd>
          <dt>Hub light client (Ethereum)</dt>
          <dd>
            <a className="mono" href={explorer.ethAddress(eth.lightClient)} target="_blank" rel="noopener">
              {eth.lightClient}
            </a>
          </dd>
          <dt>Source</dt>
          <dd>
            <a href={deployment.sourceUrl} target="_blank" rel="noopener">
              {source}
            </a>
          </dd>
        </dl>
        <ContractsCheck />
        {deployment.demo ? (
          <p className="note">
            This is the demo: nothing here touches a real chain. The addresses are the test deployment (ReeceBadTest).
          </p>
        ) : deployment.id !== 'badkids' ? (
          <p className="note">These are the test deployment ({deployment.collectionName}). The real Bad Kids addresses go here at launch.</p>
        ) : null}
      </div>
    </Card>
  )
}

/** The startup sanity check, said out loud: the contracts above are the ones the chains say they are. */
function ContractsCheck() {
  const { deployment } = useBridge()
  const sanity = useConfigSanity()
  const s = sanity.data
  if (s?.status === 'not-live') return null
  return (
    <p className={s?.ok ? 'contracts-check ok' : s?.status === 'mismatch' ? 'contracts-check bad' : 'contracts-check muted'} role="status">
      {s?.ok
        ? `✓ Checked live: the escrow only takes ${deployment.collectionName}, and the Ethereum bridge only trusts this escrow.`
        : s?.status === 'mismatch'
          ? "✗ These don't match what the chains say, so sending is switched off."
          : s || sanity.error
            ? "Couldn't double-check these against the chains just now."
            : 'Double-checking these against the chains…'}
      {/* COPY: contracts check */}
    </p>
  )
}

/** Live health: how far behind Ethereum is, whether the bridge is paused, and when we last checked. */
function HealthStrip() {
  const health = useHealth()
  const checkedAt = useChangedAt(health.data)
  const now = useWallClock()
  const h = health.data
  if (!h) {
    return (
      <p className="health muted" role="status">
        {health.error ? "Can't reach the chains right now to check on the bridge." : 'Checking on the bridge…'}
      </p>
    )
  }
  const ago = checkedAt === null ? 'just now' : Math.max(0, now - checkedAt) < 60_000 ? 'just now' : `${Math.round((now - checkedAt) / 60_000)} min ago`
  return (
    <div className="health" aria-label="Bridge health">
      <span className={h.frozen ? 'dot bad' : 'dot ok'} aria-hidden="true" />
      <span>
        <b>{h.frozen ? 'Paused' : 'Running'}</b>
        {h.frozen ? ': the light client is frozen, so no new proofs.' : '.'}
      </span>
      <span>
        {health.error
          ? "Couldn't check just now, so these numbers may be old."
          : h.stale
            ? 'Ethereum is a long way behind the Hub right now.'
            : `Ethereum is ${aboutMinutes(h.lagMinutes)} behind the Hub`}
        <span className="muted mono"> ({blockNumber(h.lagBlocks)} blocks)</span>
        {/* COPY: health strip */}
      </span>
      <span className="muted heights">
        Hub block <span className="mono">{blockNumber(h.hubHeight)}</span> · Ethereum has seen{' '}
        <span className="mono">{blockNumber(h.clientHeight)}</span>
      </span>
      {!health.error && <span className="muted">checked {ago}</span>}
    </div>
  )
}
