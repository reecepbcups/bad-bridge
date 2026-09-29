import { GetProveButton } from './GetProve'
import { useProveReady } from './ProveKid'

/** Below this in the Succinct account, offer to top up. */
const LOW_PROVE = 5n * 10n ** 17n

// COPY: what crossing costs (measured on mainnet 2026-09-28: 0.33 PROVE for a proof of 1 kid and for 10; sends are capped at 50 kids)
/** What it takes to get a kid across, so nobody finds out about PROVE halfway. */
export function CostList() {
  const ready = useProveReady()
  const low = ready.status !== 'ok' || ready.balance < LOW_PROVE
  return (
    <div className="hint">
      <b>What it costs</b>
      <ul>
        <li>Send: a Hub fee, about 0.008 ATOM. That includes the optional 0.001 ATOM "Update Ethereum IBC client" transfer.</li>
        <li>
          Proof: about 0.33 <b>PROVE</b>, paid to Succinct's prover network. That's the same for 1 kid or up to 50 in one
          send. It has to be deposited in your account there, not just held in your wallet. {low && <GetProveButton />}
        </li>
        <li>Submit the proof: about 0.002 ETH.</li>
        <li>Claim: a little ETH more.</li>
      </ul>
      <span>Send more kids together and they share one proof, so each one costs less.</span>
    </div>
  )
}
