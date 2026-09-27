import { useBridge } from '../../chain/context'
import { Card } from '../chrome/Card'
import { KidArt } from '../KidArt'
import './about.css'

// Ported from the mockup's About view. Addresses come from the active deployment.

export function AboutView() {
  const { deployment } = useBridge()
  const { hub, eth, explorer } = deployment
  const source = deployment.sourceUrl.replace(/^https:\/\//, '')
  return (
    <Card>
      <div className="about">
        <h2>What's the Bad Bridge?</h2>
        <p className="lede">
          A one-way bridge that moves Bad Kids from the Cosmos Hub to Ethereum. Same kid, same number, same art, new home.
        </p>
        <div className="celebrate">
          {[4801, 663, 3838].map((id) => (
            <KidArt key={id} id={id} size={110} />
          ))}
        </div>

        <h3>How it works</h3>
        <ol className="how">
          <li>
            <span className="n">1</span>
            <span className="where hub">Cosmos Hub</span>
            <b>You send your kid</b>It goes into an escrow on the Hub, along with the Ethereum address it should land at.
          </li>
          <li>
            <span className="n">2</span>
            <span className="where mid">In between</span>
            <b>We prove it left</b>A zero-knowledge proof shows Ethereum that the kid really is locked on the Hub.
          </li>
          <li>
            <span className="n">3</span>
            <span className="where eth">Ethereum</span>
            <b>You claim it</b>The same kid, with the same number, gets minted to your Ethereum address.
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
              Ethereum only learns about new Hub blocks when IBC Eureka relays a transfer. After that, the prover
              bundles waiting kids into one proof. Usually that's 20 to 60 minutes.
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
            <p>A normal Hub transaction to send, then about 79,000 gas on Ethereum to claim. The prover pays for the proof.</p>
          </details>
          <details>
            <summary>I closed the tab. Where's my kid?</summary>
            <p>
              Open <a href="#/kids">My kids</a> and look up your Ethereum address. It works from any device.
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
              'not live yet'
            )}
          </dd>
          <dt>BadBridge (Ethereum)</dt>
          <dd>
            {eth.bridge ? (
              <a className="mono" href={explorer.ethAddress(eth.bridge)} target="_blank" rel="noopener">
                {eth.bridge.toLowerCase()}
              </a>
            ) : (
              'not live yet'
            )}
          </dd>
          <dt>Hub light client</dt>
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
        {deployment.id !== 'badkids' && (
          <p className="note">These are the test deployment (ReeceBadTest). The real Bad Kids addresses go here at launch.</p>
        )}
      </div>
    </Card>
  )
}
