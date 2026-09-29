import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useBridge } from '../chain/context'
import type { EthAddress, SendStage } from '../chain/types'
import { useNudge } from '../trips/hooks'
import { ConnectButton } from './Connect'
import { ErrorNote } from './ErrorNote'
import { ExtLink } from './ExtLink'
import { errorCopy } from './errors'
import { kidWord } from './format'
import { useToast } from './Toasts'
import './SpeedUp.css'

// COPY: nudge progress (button labels while a speed-up send runs)
const NUDGE_LABEL: Readonly<Record<SendStage, (wallet: string) => string>> = {
  simulating: () => 'Checking…',
  signing: (wallet) => `Check ${wallet}…`,
  broadcasting: () => 'Sending…',
}

/** Skip Go's tracker: relay/ack status for an IBC transfer, not just whether the Hub tx landed. */
function skipExplorerUrl(chainId: string, txHash: string): string {
  return `https://explorer.skip.build/?tx_hash=${txHash}&chain_id=${chainId}`
}

const SKIP_POLL_MS = 5_000
/** How long a relayer usually takes after the transfer lands. Shown as a countdown, not a promise. */
const EXPECTED_MS = 5 * 60_000

const SENT_KEY = (chainId: string) => `bad-bridge:update-client:${chainId}`
/** A remembered update this old is stale news, so a refresh starts clean. */
const SENT_TTL_MS = 60 * 60_000

interface Sent {
  tx: string
  at: number
}

function loadSent(chainId: string): Sent | null {
  try {
    const raw = window.localStorage.getItem(SENT_KEY(chainId))
    const v = raw ? (JSON.parse(raw) as Partial<Sent>) : null
    if (v && typeof v.tx === 'string' && typeof v.at === 'number' && Date.now() - v.at < SENT_TTL_MS) return { tx: v.tx, at: v.at }
  } catch {
    // storage blocked or unreadable: same as nothing remembered
  }
  return null
}

function saveSent(chainId: string, sent: Sent): void {
  try {
    window.localStorage.setItem(SENT_KEY(chainId), JSON.stringify(sent))
  } catch {
    // remembering is a nicety
  }
}

/** "STATE_COMPLETED_SUCCESS" as "completed success". */
function stateText(state: string): string {
  return state.replace(/^STATE_/, '').replaceAll('_', ' ').toLowerCase()
}

/** "4:07", counting down to 0:00. */
function countdown(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Wall-clock ms, ticking every second while `active`. */
function useSecondClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

/** Skip Go's relay state for the transfer, polled until it settles. */
function useSkipState(chainId: string, txHash: string | null, enabled: boolean): string | null {
  const q = useQuery({
    queryKey: ['skip-tx-status', chainId, txHash],
    enabled: enabled && txHash !== null,
    queryFn: async () => {
      const res = await fetch(`https://api.skip.build/v2/tx/status?tx_hash=${txHash}&chain_id=${chainId}`)
      if (!res.ok) throw new Error(`skip status ${res.status}`)
      const body = (await res.json()) as { state?: string }
      return body.state ?? null
    },
    refetchInterval: (query) => (settled(query.state.data ?? null) ? false : SKIP_POLL_MS),
  })
  return q.data ?? null
}

/** Success or error both mean the packet was handled, so the client got its update. */
function settled(state: string | null): boolean {
  return state !== null && state.includes('COMPLETED')
}

/**
 * Sends a small ATOM transfer to `recipient`, so a relayer watching for ICS20 packets notices sooner and
 * updates Ethereum's light client. A nudge, not a guarantee: it doesn't skip proving, and nothing here promises
 * it'll actually go faster.
 */
export function SpeedUp({
  recipient,
  n,
  disabledReason,
}: {
  recipient: EthAddress
  n: number
  /** Set when nudging can't help right now (e.g. Ethereum's light client already caught up to every kid in
   * flight): grays the button out with this as the explanation, instead of hiding it outright. */
  disabledReason?: string
}) {
  const { deployment, hubWallet } = useBridge()
  const toast = useToast()
  const [reached, setReached] = useState<SendStage | null>(null)
  const [sent, setSent] = useState<Sent | null>(() => loadSent(deployment.hub.chainId))
  const sentTx = sent?.tx ?? null
  const sentAt = sent?.at ?? null
  const nudge = useNudge({ onStage: setReached })
  const sending = nudge.status === 'pending'
  const walletName = hubWallet.walletName ?? 'your wallet'
  const skipState = useSkipState(deployment.hub.chainId, sentTx, !deployment.demo)
  const relayed = settled(skipState)
  const now = useSecondClock(sentTx !== null && !relayed)
  const stage: SendStage | null = sending ? (nudge.stage ?? 'simulating') : null

  if (disabledReason) {
    return (
      <div className="speed-up">
        <button type="button" className="btn ghost small" disabled aria-disabled="true">
          Update Ethereum IBC client
        </button>
        <p className="hint">{disabledReason}</p>
      </div>
    )
  }

  if (hubWallet.status !== 'connected') {
    return (
      <p className="hint">
        <ConnectButton chain="hub" className="btn ghost small">
          Connect Cosmos Hub
        </ConnectButton>{' '}
        to speed it up with a small ATOM transfer.
        {/* COPY: speed-up connect prompt */}
      </p>
    )
  }

  const onNudge = async () => {
    if (sending) return
    setReached(null)
    try {
      const result = await nudge.run(recipient)
      const next = { tx: result.txHash, at: Date.now() }
      setSent(next)
      saveSent(deployment.hub.chainId, next)
      toast({
        tone: 'ok',
        title: 'Sent a speed-up transfer',
        link: { href: skipExplorerUrl(deployment.hub.chainId, result.txHash), label: 'Track it on Skip Go' },
      })
    } catch {
      // nudge.error has it
    }
  }

  // a failed broadcast may still have landed; only say so once it's not a safe (nothing-moved) failure
  const mightHaveLanded = nudge.error !== null && reached === 'broadcasting' && !errorCopy(nudge.error, { action: 'send' }).safe

  return (
    <div className="speed-up">
      <button type="button" className="btn ghost small" disabled={sending} aria-disabled={sending || undefined} onClick={() => void onNudge()}>
        {stage ? NUDGE_LABEL[stage](walletName) : 'Update Ethereum IBC client'}
      </button>
      <p className="hint">
        Sends 0.001 ATOM to the address your {kidWord(n)} {n === 1 ? 'is' : 'are'} heading to, plus a small network
        fee. Relayers watch for ATOM transfers like this one, so it can help Ethereum catch up sooner. It takes
        about 5 minutes after you submit. No guarantees.
        {/* COPY: speed-up hint */}
      </p>
      {sentTx && (
        <p className="hint" role="status">
          <ExtLink href={skipExplorerUrl(deployment.hub.chainId, sentTx)}>Track it on Skip Go</ExtLink> ·{' '}
          {relayed ? (
            "Relayed. Ethereum's client got its update."
          ) : (
            <>
              Status: <b>{skipState ? stateText(skipState) : 'checking…'}</b>.{' '}
              {sentAt !== null && now - sentAt < EXPECTED_MS
                ? `About ${countdown(EXPECTED_MS - Math.max(0, now - sentAt))} left. `
                : 'Taking longer than usual, still watching. '}
              Success or failure both mean the client updated.
            </>
          )}
        </p>
      )}
      {nudge.error && (
        <>
          <ErrorNote error={nudge.error} action="send" walletName={hubWallet.walletName} onRetry={() => void onNudge()} retryLabel="Try again" />
          {mightHaveLanded && <p className="hint">Before trying again, check an explorer in case it went through.</p>}
        </>
      )}
    </div>
  )
}
