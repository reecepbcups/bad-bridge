import { useIsMutating } from '@tanstack/react-query'
import { useRef } from 'react'
import { useBridge } from '../../../chain/context'
import { useClaimEstimate, useClaimKids } from '../../../trips/hooks'
import type { Trip } from '../../../trips/types'
import { claimedToast, claimingHint, claimingLabel, formatEth } from '../../Claim'
import { ConnectButton } from '../../Connect'
import { ErrorNote } from '../../ErrorNote'
import { ExtLink } from '../../ExtLink'
import { kidList, kidWord, shortAddress } from '../../format'
import { KidArt } from '../../KidArt'
import { useToast } from '../../Toasts'
import { SwitchChain } from '../../SwitchChain'
import { useTitle } from '../../useTitle'
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
  const { deployment, ethWallet, ethWriter } = useBridge()
  const { update } = useFlow()
  const toast = useToast()
  const claim = useClaimKids()
  const claimRow = useRef<HTMLDivElement>(null)
  useTitle('Ready to claim')
  // in the order they were sent, like the pictures and the headings
  const stageOf = new Map(trips.map((t) => [t.tokenId, t.stage]))
  const ready = sent.ids.filter((id) => stageOf.get(id) === 'ready')
  const already = sent.ids.filter((id) => stageOf.get(id) === 'home-eth')
  const n = ready.length
  const estimate = useClaimEstimate(ready)
  // survives an unmount/remount of this step: a claim from before the remount still counts as pending
  const claimMutating = useIsMutating({ mutationKey: ['bridge', deployment.id, 'claim'] }) > 0
  const pending = claim.status === 'pending' || claimMutating
  // null only for the moment before the writer reports its first stage
  const stage = pending ? (claim.stage ?? 'signing') : null

  const onClaim = async () => {
    // aria-disabled while pending keeps focus on the button, so the click is refused here
    if (pending || n === 0) return
    try {
      const result = await claim.run(ready)
      update({ claimTx: result.txHash })
      toast(claimedToast(ready, result.txHash, deployment.explorer))
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
        The proof landed on Ethereum. Claim to mint{' '}
        {n === 1 ? (sent.ids.length === 1 ? 'your kid' : kidList(ready)) : n === 2 ? 'both kids' : `all ${n} kids`} to{' '}
        <span className="mono nowrap">{shortAddress(sent.recipient)}</span>.
      </p>
      {already.length > 0 && (
        <p className="hint center">
          {kidList(already)} {already.length === 1 ? 'is' : 'are'} already home: someone claimed {already.length === 1 ? 'it' : 'them'} for
          you.
        </p>
      )}
      <div className="row center" ref={claimRow}>
        {ethWallet.status !== 'connected' || !ethWriter ? (
          <ConnectButton chain="eth" className="btn eth" focusAfter={() => claimRow.current?.querySelector('button')}>
            Connect Ethereum to claim
          </ConnectButton>
        ) : ethWallet.wrongChain ? (
          <SwitchChain />
        ) : (
          <button
            type="button"
            className="btn eth"
            disabled={!pending && n === 0}
            aria-disabled={pending || undefined}
            onClick={() => void onClaim()}
          >
            {stage ? claimingLabel(stage, ethWallet.walletName) : `Claim ${n} ${kidWord(n)}`}
          </button>
        )}
      </div>
      {!stage && n > 0 && estimate.data && (
        <p className="hint center">
          ≈ {formatEth(estimate.data.fee)} network fee.
          {/* COPY: claim fee estimate */}
        </p>
      )}
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
        One Ethereum transaction claims {n === 1 ? 'it' : n === 2 ? 'both' : 'them all'}. Anyone can claim; it always goes to{' '}
        <span className="mono nowrap">{shortAddress(sent.recipient)}</span>.
        {/* COPY: claim hint */}
      </p>
    </>
  )
}

/** Home. Links go through the deployment's explorer builders. */
export function DoneStep({ sent, claimTx }: { sent: SentTrip; claimTx: string | null }) {
  const { deployment } = useBridge()
  const { restart } = useFlow()
  useTitle('Welcome to Ethereum')
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
          <ExtLink className="btn ghost" href={etherscan}>
            View on Etherscan
          </ExtLink>
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
              <ExtLink className="nowrap" href={o.url}>
                #{o.id}
              </ExtLink>
            </span>
          ))}
        </p>
      )}
    </>
  )
}
