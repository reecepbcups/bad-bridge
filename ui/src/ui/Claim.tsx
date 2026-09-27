import { useState } from 'react'
import { useBridge } from '../chain/context'
import type { BridgeError, ClaimStage, KidId } from '../chain/types'
import { useClaimKids } from '../trips/hooks'
import { ConnectButton } from './Connect'
import { kidList } from './format'
import { useToast } from './Toasts'

/** One claim mutation shared by a list of rows, remembering which kids the current or last claim was for. */
export interface ClaimFlow {
  run: (ids: readonly KidId[]) => Promise<void>
  pending: boolean
  /** Kids in the claim that's running. */
  claiming: readonly KidId[]
  /** Where the running claim is: signing (wallet prompt up) → confirming (sent, waiting to be mined). */
  stage: ClaimStage | null
  /** The last failure and the kids it was for. */
  failure: { error: BridgeError; ids: readonly KidId[] } | null
}

export function useClaimFlow(): ClaimFlow {
  const { deployment } = useBridge()
  const claim = useClaimKids()
  const toast = useToast()
  const [claiming, setClaiming] = useState<readonly KidId[]>([])
  const [failure, setFailure] = useState<ClaimFlow['failure']>(null)
  const run = async (ids: readonly KidId[]) => {
    setClaiming(ids)
    setFailure(null)
    try {
      const result = await claim.run(ids)
      toast({
        tone: 'ok',
        title: `Claimed ${ids.length > 3 ? `${ids.length} kids` : kidList(ids)}`,
        body: 'Minted on Ethereum. Welcome home.',
        link: { href: deployment.explorer.ethTx(result.txHash), label: 'See it on Etherscan' },
      })
    } catch (e) {
      setFailure({ error: e as BridgeError, ids })
    } finally {
      setClaiming([])
    }
  }
  const pending = claim.status === 'pending'
  return { run, pending, claiming, stage: pending ? (claim.stage ?? 'signing') : null, failure }
}

// COPY: claim progress (button label and status line)
/** A claim button's label while its claim runs. */
export function claimingLabel(stage: ClaimStage, walletName: string | undefined): string {
  return stage === 'confirming' ? 'Claiming…' : `Check ${walletName ?? 'your wallet'}…`
}

/** The status line while a claim runs. */
export function claimingHint(stage: ClaimStage, walletName: string | undefined): string {
  return stage === 'confirming' ? 'Sent. Waiting for Ethereum to mine it…' : `Approve it in ${walletName ?? 'your wallet'}.`
}

/** A Claim button for some ready kids. Without an Ethereum wallet it opens the connect sheet instead. */
export function ClaimButton({ ids, flow, children }: { ids: readonly KidId[]; flow: ClaimFlow; children: string }) {
  const { ethWallet, ethWriter } = useBridge()
  if (!ethWriter) {
    return (
      <ConnectButton chain="eth" className="btn eth">
        {children}
      </ConnectButton>
    )
  }
  const mine = ids.some((id) => flow.claiming.includes(id))
  return (
    <button
      type="button"
      className="btn eth"
      disabled={flow.pending || ethWallet.wrongChain === true}
      onClick={() => void flow.run(ids)}
    >
      {mine && flow.stage ? claimingLabel(flow.stage, ethWallet.walletName) : children}
    </button>
  )
}
