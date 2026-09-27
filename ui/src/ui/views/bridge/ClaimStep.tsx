import { useBridge } from '../../../chain/context'
import { useClaimKids } from '../../../trips/hooks'
import type { Trip } from '../../../trips/types'
import { claimingHint, claimingLabel } from '../../Claim'
import { ConnectButton } from '../../Connect'
import { ErrorNote } from '../../ErrorNote'
import { kidList, kidWord, shortAddress } from '../../format'
import { KidArt } from '../../KidArt'
import { useToast } from '../../Toasts'
import { SwitchChain } from '../../SwitchChain'
import { useFlow, type SentTrip } from './flow'

/** At most this many pictures in a celebration row. */
const PARADE = 6

function Parade({ ids }: { ids: readonly number[] }) {
  return (
    <div className="celebrate">
      {ids.slice(0, PARADE).map((id) => (
        <KidArt key={id} id={id} size={110} eager />
      ))}
    </div>
  )
}

/** Proven: one Ethereum tx mints every ready kid. */
export function ClaimStep({ sent, trips }: { sent: SentTrip; trips: readonly Trip[] }) {
  const { ethWallet, ethWriter } = useBridge()
  const { update } = useFlow()
  const toast = useToast()
  const claim = useClaimKids()
  const ready = trips.filter((t) => sent.ids.includes(t.tokenId) && t.stage === 'ready').map((t) => t.tokenId)
  const already = trips.filter((t) => sent.ids.includes(t.tokenId) && t.stage === 'home-eth').map((t) => t.tokenId)
  const n = ready.length
  const pending = claim.status === 'pending'
  // null only for the moment before the writer reports its first stage
  const stage = pending ? (claim.stage ?? 'signing') : null

  const onClaim = async () => {
    if (pending || n === 0) return
    try {
      const result = await claim.run(ready)
      update({ claimTx: result.txHash })
      toast({ tone: 'ok', title: `Claimed ${kidList(ready)}`, body: 'Minted on Ethereum.' })
    } catch {
      // claim.error has it
    }
  }

  return (
    <>
      <Parade ids={sent.ids} />
      <h2 tabIndex={-1} className="center">
        {sent.ids.length === 1 ? 'It made it across!' : 'They made it across!'}
      </h2>
      <p className="lede center">
        The proof landed on Ethereum. Claim to mint {n === 1 ? (sent.ids.length === 1 ? 'your kid' : kidList(ready)) : `all ${n} kids`}{' '}
        to <span className="mono">{shortAddress(sent.recipient)}</span>.
      </p>
      {already.length > 0 && (
        <p className="hint center">
          {kidList(already)} {already.length === 1 ? 'is' : 'are'} already home: someone claimed {already.length === 1 ? 'it' : 'them'} for
          you.
        </p>
      )}
      <div className="row center">
        {ethWallet.status !== 'connected' || !ethWriter ? (
          <ConnectButton chain="eth" className="btn eth">
            Connect Ethereum to claim
          </ConnectButton>
        ) : ethWallet.wrongChain ? (
          <SwitchChain />
        ) : (
          <button type="button" className="btn eth" disabled={pending || n === 0} onClick={() => void onClaim()}>
            {stage ? claimingLabel(stage, ethWallet.walletName) : `Claim ${n} ${kidWord(n)}`}
          </button>
        )}
      </div>
      {stage && (
        <p className="hint center" role="status">
          {claimingHint(stage, ethWallet.walletName)}
        </p>
      )}
      {claim.error && (
        <>
          <ErrorNote error={claim.error} action="claim" walletName={ethWallet.walletName} />
          {claim.error.code === 'WrongChain' && !ethWallet.wrongChain && <SwitchChain />}
        </>
      )}
      <p className="hint center">
        One Ethereum transaction claims {n === 1 ? 'it' : 'them all'}. Anyone can claim; it always goes to{' '}
        <span className="mono">{shortAddress(sent.recipient)}</span>.
        {/* COPY: claim hint */}
      </p>
    </>
  )
}

/** Home. Links go through the deployment's explorer builders. */
export function DoneStep({ sent, claimTx }: { sent: SentTrip; claimTx: string | null }) {
  const { deployment } = useBridge()
  const { restart } = useFlow()
  const { explorer } = deployment
  const n = sent.ids.length
  const first = sent.ids[0]
  const etherscan = claimTx ? explorer.ethTx(claimTx) : first !== undefined ? explorer.ethToken(first) : null
  const opensea = sent.ids.map((id) => ({ id, url: explorer.opensea(id) })).filter((o): o is { id: number; url: string } => o.url !== null)
  return (
    <>
      <Parade ids={sent.ids} />
      <h2 tabIndex={-1} className="center">
        Welcome to Ethereum, {n <= 3 ? kidList(sent.ids) : `all ${n} kids`}
      </h2>
      <p className="center stamp-row">
        <span className="stamp">minted on Ethereum</span>
      </p>
      <p className="lede center">
        {claimTx ? '' : 'Someone already claimed for you. '}Same IDs, same art. {n === 1 ? 'It shows' : "They'll show"} up in your
        wallet and on marketplaces in a minute or two.
      </p>
      <div className="row center">
        {etherscan && (
          <a className="btn ghost" href={etherscan} target="_blank" rel="noopener">
            View on Etherscan ↗
          </a>
        )}
        <button type="button" className="btn" onClick={restart}>
          Bridge another
        </button>
      </div>
      {opensea.length > 0 && (
        <p className="hint center">
          On OpenSea:{' '}
          {opensea.map((o, i) => (
            <span key={o.id}>
              {i > 0 && ' · '}
              <a href={o.url} target="_blank" rel="noopener">
                #{o.id} ↗
              </a>
            </span>
          ))}
        </p>
      )}
    </>
  )
}
