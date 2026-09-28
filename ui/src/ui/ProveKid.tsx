import { useEffect, useState } from 'react'
import { useBridge } from '../chain/context'
import type { ProveStage } from '../chain/prove'
import type { BridgeError, EthAddress, KidId } from '../chain/types'
import { ConnectButton } from './Connect'
import { ExtLink } from './ExtLink'
import { useToast, type Toast } from './Toasts'

// Mirrors Claim.tsx's useClaimFlow/ClaimButton pattern, for the browser-only "prove my own kid" flow
// (issue #8): own kid only, one at a time, same wallet that would eventually submitBatch it.

/** Where the connected wallet manages its Succinct network PROVE balance. */
const PROVE_ACCOUNT_URL = 'https://explorer.succinct.xyz/account'

/** The toast once a kid's proof lands on Ethereum. */
export function provenToast(id: KidId): Toast {
  return {
    tone: 'ok',
    title: `Proved #${id}`,
    body: 'The proof landed on Ethereum. It can be claimed now.',
  }
}

export interface ProveFlow {
  run: (id: KidId, expectedRecipient?: EthAddress) => Promise<void>
  pending: boolean
  /** The kid the running (or last) prove was for. */
  proving: KidId | null
  stage: ProveStage | null
  failure: { error: BridgeError; id: KidId } | null
}

// COPY: prove-my-kid progress (button label and status line)
const STAGE_LABEL: Readonly<Record<ProveStage, string>> = {
  'finding-proof': 'Finding the proof…',
  'uploading-stdin': 'Uploading…',
  'requesting-proof': 'Requesting a proof…',
  proving: 'Proving…',
  signing: 'Check your wallet…',
  confirming: 'Submitting…',
}

export function useProveFlow(): ProveFlow {
  const { proveKid } = useBridge()
  const toast = useToast()
  const [proving, setProving] = useState<KidId | null>(null)
  const [stage, setStage] = useState<ProveStage | null>(null)
  const [failure, setFailure] = useState<ProveFlow['failure']>(null)

  const run = async (id: KidId, expectedRecipient?: EthAddress) => {
    if (!proveKid) return
    setProving(id)
    setStage(null)
    setFailure(null)
    try {
      await proveKid.proveKid(id, { expectedRecipient, onStage: setStage })
      toast(provenToast(id))
    } catch (e) {
      setFailure({ error: e as BridgeError, id })
    } finally {
      setProving(null)
      setStage(null)
    }
  }
  return { run, pending: proving !== null, proving, stage, failure }
}

/**
 * The connected wallet's PROVE balance on Succinct's network, read once per wallet (see
 * chain/prove.ts's proveBalance — no signature needed). `null` while loading, not yet fetched, or the read
 * failed; failures aren't surfaced here since this is only ever used for an optional "you might need PROVE"
 * hint, not something to block on.
 */
function useProveBalance(): bigint | null {
  const { proveKid } = useBridge()
  const [wei, setWei] = useState<bigint | null>(null)
  useEffect(() => {
    if (!proveKid) return
    let cancelled = false
    proveKid
      .proveBalance()
      .then((w) => {
        if (!cancelled) setWei(w)
      })
      .catch(() => {
        if (!cancelled) setWei(null)
      })
    return () => {
      cancelled = true
    }
  }, [proveKid])
  // Derived, not reset in the effect: no wallet (or a wallet whose fetch hasn't resolved yet) reads as null.
  return proveKid ? wei : null
}

/**
 * "You'll need a bit of $PROVE" — shown once the connected wallet's Succinct network balance reads back as
 * exactly zero (not while it's still loading, and not on a failed read: both are `null`, so this stays quiet
 * rather than risk a false alarm before someone's even tried proving anything).
 */
export function ProveBalanceNote() {
  const balance = useProveBalance()
  if (balance !== 0n) return null
  return (
    <p className="hint">
      Proving costs a little $PROVE on Succinct's network — looks like this wallet doesn't have any yet.{' '}
      <ExtLink href={PROVE_ACCOUNT_URL}>Get PROVE</ExtLink>
    </p>
  )
}

/** A "Prove it yourself" button for a kid whose proof hasn't landed yet. Without a wallet it opens the connect sheet. */
export function ProveButton({
  id,
  expectedRecipient,
  flow,
  children,
}: {
  id: KidId
  /** Checked against the Hub's own record before proving (see chain/prove.ts). */
  expectedRecipient?: EthAddress
  flow: ProveFlow
  children: string
}) {
  const { ethWallet, proveKid } = useBridge()
  if (!proveKid) {
    return (
      <ConnectButton chain="eth" className="btn eth ghost" focusAfter={() => document.querySelector<HTMLElement>(`[data-prove="${id}"]`)}>
        {children}
      </ConnectButton>
    )
  }
  const mine = flow.proving === id
  return (
    <button
      type="button"
      className="btn eth ghost"
      data-prove={id}
      disabled={ethWallet.wrongChain === true}
      aria-disabled={flow.pending || undefined}
      onClick={() => {
        if (!flow.pending) void flow.run(id, expectedRecipient)
      }}
    >
      {mine && flow.stage ? STAGE_LABEL[flow.stage] : children}
    </button>
  )
}
