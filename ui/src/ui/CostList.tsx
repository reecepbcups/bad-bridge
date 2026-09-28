import { GetProveButton } from './GetProve'

// COPY: what crossing costs (measured on mainnet 2026-09-28: 0.33 PROVE for a proof of 1 kid and for 10)
/** What it takes to get a kid across, so nobody finds out about PROVE halfway. */
export function CostList() {
  return (
    <div className="hint">
      <b>What it costs</b>
      <ul>
        <li>Send: a Hub fee, about 0.017 ATOM. That includes the optional 0.01 ATOM "Speed it up" transfer.</li>
        <li>
          Proof: about 0.33 <b>PROVE</b>, paid to Succinct's prover network. That's the same for 1 kid or 10 in one
          send. It has to be deposited in your account there, not just held in your wallet. <GetProveButton />
        </li>
        <li>Submit the proof: about 0.002 ETH.</li>
        <li>Claim: a little ETH more.</li>
      </ul>
      <span>Send more kids together and they share one proof, so each one costs less.</span>
    </div>
  )
}
