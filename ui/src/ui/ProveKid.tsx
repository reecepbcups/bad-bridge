import { useEffect, useState } from 'react'
import { useBridge } from '../chain/context'
import type { ProveStage } from '../chain/prove'
import type { BridgeError, EthAddress, KidId } from '../chain/types'
import { ConnectButton } from './Connect'
import { ExtLink } from './ExtLink'
import { kidList } from './format'
import { useToast, type Toast } from './Toasts'

// Mirrors Claim.tsx's useClaimFlow/ClaimButton pattern, for the browser-only "prove my own kids" flow
// (issue #8): own kids only, any number of them together in one batch, same wallet that would eventually
// submitBatch it.

/** Where the connected wallet manages its Succinct network PROVE balance. */
const PROVE_ACCOUNT_URL = 'https://explorer.succinct.xyz/account'

/** The toast once one or more kids' proofs land on Ethereum. `ids` is whichever ones actually made it into
 * the batch (see ProveKidsResult.proved) — can be fewer than what was asked for. */
export function provenToast(ids: readonly KidId[]): Toast {
  return {
    tone: 'ok',
    title: `Proved ${ids.length > 3 ? `${ids.length} kids` : kidList(ids)}`,
    body: 'The proof landed on Ethereum. It can be claimed now.',
  }
}

export interface ProveFlow {
  run: (ids: readonly KidId[], expectedRecipients?: ReadonlyMap<KidId, EthAddress>) => Promise<void>
  pending: boolean
  /** The kids the running (or last) prove batch was asked for. */
  proving: readonly KidId[]
  stage: ProveStage | null
  failure: { error: BridgeError; ids: readonly KidId[] } | null
}

// COPY: prove-my-kids progress (button label and status line)
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
  const [proving, setProving] = useState<readonly KidId[]>([])
  const [stage, setStage] = useState<ProveStage | null>(null)
  const [failure, setFailure] = useState<ProveFlow['failure']>(null)

  const run = async (ids: readonly KidId[], expectedRecipients?: ReadonlyMap<KidId, EthAddress>) => {
    if (!proveKid || ids.length === 0) return
    setProving(ids)
    setStage(null)
    setFailure(null)
    try {
      const result = await proveKid.proveKids(ids, { expectedRecipients, onStage: setStage })
      toast(provenToast(result.proved))
    } catch (e) {
      setFailure({ error: e as BridgeError, ids })
    } finally {
      setProving([])
      setStage(null)
    }
  }
  return { run, pending: proving.length > 0, proving, stage, failure }
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

/** A "Prove it yourself" button for one or more kids whose proof hasn't landed yet, batched into one proof and
 * one submitBatch tx. Without a wallet it opens the connect sheet. */
export function ProveButton({
  ids,
  expectedRecipients,
  flow,
  children,
}: {
  ids: readonly KidId[]
  /** Per-id, checked against the Hub's own record before proving (see chain/prove.ts). */
  expectedRecipients?: ReadonlyMap<KidId, EthAddress>
  flow: ProveFlow
  children: string
}) {
  const { ethWallet, proveKid } = useBridge()
  // finds this button again after a connect, even if the list around it re-rendered from scratch
  const key = ids.join(' ')
  if (!proveKid) {
    return (
      <ConnectButton chain="eth" className="btn eth ghost" focusAfter={() => document.querySelector<HTMLElement>(`[data-prove="${key}"]`)}>
        {children}
      </ConnectButton>
    )
  }
  const mine = ids.some((id) => flow.proving.includes(id))
  return (
    <button
      type="button"
      className="btn eth ghost"
      data-prove={key}
      disabled={ethWallet.wrongChain === true}
      aria-disabled={flow.pending || undefined}
      onClick={() => {
        if (!flow.pending) void flow.run(ids, expectedRecipients)
      }}
    >
      {mine && flow.stage ? STAGE_LABEL[flow.stage] : children}
    </button>
  )
}
