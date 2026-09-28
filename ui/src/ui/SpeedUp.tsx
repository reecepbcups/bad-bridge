import { useState } from 'react'
import { useBridge } from '../chain/context'
import type { EthAddress, SendStage } from '../chain/types'
import { useNudge } from '../trips/hooks'
import { ConnectButton } from './Connect'
import { ErrorNote } from './ErrorNote'
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

/**
 * Sends a small ATOM transfer to `recipient`, so a relayer watching for ICS20 packets notices sooner and
 * updates Ethereum's light client. A nudge, not a guarantee: it doesn't skip proving, and nothing here promises
 * it'll actually go faster.
 */
export function SpeedUp({ recipient, n }: { recipient: EthAddress; n: number }) {
  const { deployment, hubWallet } = useBridge()
  const toast = useToast()
  const [reached, setReached] = useState<SendStage | null>(null)
  const nudge = useNudge({ onStage: setReached })
  const sending = nudge.status === 'pending'
  const walletName = hubWallet.walletName ?? 'your wallet'
  const stage: SendStage | null = sending ? (nudge.stage ?? 'simulating') : null

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
        {stage ? NUDGE_LABEL[stage](walletName) : 'Speed it up'}
      </button>
      <p className="hint">
        Sends 0.01 ATOM to the address your {kidWord(n)} {n === 1 ? 'is' : 'are'} heading to, plus a small network
        fee. Relayers watch for ATOM transfers like this one, so it can help Ethereum catch up sooner. No
        guarantees.
        {/* COPY: speed-up hint */}
      </p>
      {nudge.error && (
        <>
          <ErrorNote error={nudge.error} action="send" walletName={hubWallet.walletName} onRetry={() => void onNudge()} retryLabel="Try again" />
          {mightHaveLanded && <p className="hint">Before trying again, check an explorer in case it went through.</p>}
        </>
      )}
    </div>
  )
}
