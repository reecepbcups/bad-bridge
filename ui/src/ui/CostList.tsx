import { GetProveButton } from './GetProve'

// COPY: what crossing costs (measured on mainnet with 10 kids, 2026-09-28; proof cost grows slowly with batch size)
/** What it takes to get a kid across, so nobody finds out about PROVE halfway. */
export function CostList() {
  return (
    <div className="hint">
      <b>What it costs, for about 10 kids</b>
      <ul>
        <li>Send: a Hub fee, about 0.017 ATOM. That includes the optional 0.01 ATOM "Speed it up" transfer.</li>
        <li>
          Proof: about 0.33 <b>PROVE</b>, paid to Succinct's prover network. It has to be deposited in your account there,
          not just held in your wallet. <GetProveButton />
        </li>
        <li>Submit the proof: about 0.002 ETH.</li>
        <li>Claim: a little ETH more.</li>
      </ul>
      <span>More kids in one send share the same proof, so each one costs less.</span>
    </div>
  )
}
