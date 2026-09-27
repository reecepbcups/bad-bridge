import { useEffect, useId, useState } from 'react'
import { useBridge } from '../../../chain/context'
import { checkRecipient, type RecipientCheck } from '../../../chain/eth/recipient'
import type { EthAddress, KidId } from '../../../chain/types'
import { useConfigSanity, useHealth, useSendEstimate, useSendKids } from '../../../trips/hooks'
import { ConnectButton } from '../../Connect'
import { ErrorNote } from '../../ErrorNote'
import { errorCopy } from '../../errors'
import { formatFee, kidWord, shortAddress } from '../../format'
import { useIsContract } from '../../hooks'
import { KidArt } from '../../KidArt'
import { useToast } from '../../Toasts'
import { useFlow } from './flow'

const BAD_ADDRESS: Readonly<Record<Exclude<RecipientCheck, { ok: true }>['reason'], string>> = {
  format: "That doesn't look like an Ethereum address (0x + 40 characters).",
  zero: "That's the zero address. Kids sent there are gone forever.",
  checksum: "The capital letters don't match this address's checksum, so there may be a typo. Copy it again from your wallet.",
}

const CHECKING_SEND = 'Checking the send with the Hub…'

export function ReviewStep() {
  const { deployment, hubWallet, ethWallet, hubWriter } = useBridge()
  const { flow, update } = useFlow()
  const toast = useToast()
  const ids = flow.picked
  const n = ids.length

  // recipient: follows the connected Ethereum wallet until the user types
  const connectedEth = ethWallet.status === 'connected' ? ethWallet.address : undefined
  const input = flow.recipient ?? connectedEth ?? ''
  const auto = flow.recipient === null && connectedEth !== undefined
  const check = input.trim() ? checkRecipient(input, connectedEth) : null
  const address: EthAddress | null = check?.ok ? check.address : null

  const contract = useIsContract(address)
  const [holdsFor, setHoldsFor] = useState<string | null>(null)
  const canHold = address !== null && holdsFor === address
  const [agreed, setAgreed] = useState(false)

  const sanity = useConfigSanity()
  const health = useHealth()
  const estimate = useSendEstimate(ids, address)
  const send = useSendKids()
  const sending = send.status === 'pending'
  const walletName = hubWallet.walletName ?? 'your wallet'
  const signed = useSignedWhile(sending)

  const inputId = useId()
  const hintId = useId()
  const whyId = useId()

  const reason = whyDisabled()
  function whyDisabled(): string | null {
    if (!hubWriter) return 'Connect your Cosmos Hub wallet first.'
    if (n === 0) return 'Pick at least one kid.'
    const s = sanity.data
    if (!s) return sanity.error ? "Couldn't double-check the bridge contracts, so sending is off for now." : 'Double-checking the bridge contracts…'
    if (s.status === 'not-live' || s.problems.some((p) => p.code === 'NotLive')) return "The bridge isn't open yet."
    if (!s.ok) {
      return s.status === 'unknown' || s.problems.length === 0
        ? "Couldn't double-check the bridge contracts, so sending is off for now."
        : "Sending is switched off: the bridge contracts don't match (see the note up top)."
    }
    const h = health.data
    if (!h) return health.error ? "Can't reach Ethereum to check the bridge, so sending is off for now." : 'Checking the bridge…'
    if (h.frozen) return 'The bridge is paused, so sending is off.'
    if (!check) return 'Add the Ethereum address your kids should land at.'
    if (!check.ok) return 'Fix the Ethereum address first.'
    if (contract.data === undefined) return contract.error ? "Couldn't check the address. Try again." : 'Checking the address…'
    if (contract.data && !canHold) return 'Tick “This address can hold NFTs” to send to a contract.'
    if (!agreed) return 'Tick “Got it, one way only” to send.'
    // an error wins over old data: the latest simulation is the one that counts
    if (estimate.error) return 'The Hub said no to this send (see above).'
    if (!estimate.data) return CHECKING_SEND
    return null
  }
  const disabled = reason !== null || sending

  const onSend = async () => {
    if (disabled || !address) return
    signed.reset()
    try {
      const result = await send.run(ids, address)
      update({ sent: { ids, recipient: address, txHash: result.txHash }, picked: [], claimTx: null })
      toast({
        tone: 'ok',
        title: `Sent! ${n} ${kidWord(n)} on the bridge`,
        link: { href: deployment.explorer.hubTx(result.txHash), label: 'See it on Mintscan' },
      })
    } catch {
      // send.error has it
    }
  }

  const unpick = (id: KidId) => {
    update((f) => ({ picked: f.picked.filter((p) => p !== id) }))
    send.reset()
  }

  const blockingError = send.error ?? estimate.error
  const blockingKid = blockingError?.tokenId
  const canUnpick =
    blockingKid !== undefined && ids.includes(blockingKid) && n > 1 && (blockingError?.code === 'AlreadyBridged' || blockingError?.code === 'NotOwner')

  // checking → "Check Keplr…" → sending → the crossing screen
  const label = sending
    ? signed.done
      ? 'Sending…'
      : `Check ${walletName}…`
    : reason === CHECKING_SEND
      ? 'Checking…'
      : `Send ${n} ${kidWord(n)}`
  const mightHaveLanded = send.error !== null && !errorCopy(send.error, { action: 'send' }).safe

  return (
    <>
      <h2 tabIndex={-1}>Where do they land?</h2>
      <div className="picked" aria-label="Picked kids">
        {ids.map((id) => (
          <span key={id} className="mini">
            <KidArt id={id} size={44} decorative eager />#{id}
          </span>
        ))}
      </div>

      <div className="field">
        <label htmlFor={inputId}>Ethereum address</label>
        <input
          type="text"
          id={inputId}
          value={input}
          onChange={(e) => update({ recipient: e.target.value })}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          placeholder="0x…"
          aria-invalid={check !== null && !check.ok}
          aria-describedby={hintId}
        />
      </div>
      <RecipientHint id={hintId} check={check} auto={auto} connected={connectedEth} walletName={ethWallet.walletName} />
      {!connectedEth && (
        <div className="row start">
          <ConnectButton chain="eth" className="btn ghost small">
            Connect Ethereum to fill it in
          </ConnectButton>
        </div>
      )}

      {address && contract.data && (
        <>
          <div className="warn">
            <WarnIcon />
            <div>
              <b>That's a contract, not a wallet.</b>
              Some contracts can't hold NFTs, and a kid minted to one could be stuck for good. Only go on if you're sure
              this one can.
              {/* COPY: contract recipient warning */}
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={canHold} onChange={(e) => setHoldsFor(e.target.checked ? address : null)} /> This
            address can hold NFTs
          </label>
        </>
      )}
      {address && contract.error && !contract.data && (
        <ErrorNote error={contract.error} action="read" onRetry={contract.refetch} retryLabel="Check the address again" />
      )}

      <div className="warn">
        <WarnIcon />
        <div>
          <b>No take-backs.</b>
          This bridge only goes one way. Once a kid leaves the Hub, it lives on Ethereum for good. Ethereum kids trade on
          Ethereum, separately from Bad Kids on the Hub and Stargaze.
          {/* COPY: needs sign-off */}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> Got it, one way only
      </label>

      {sanity.error && sanity.data?.ok !== true && (
        <ErrorNote error={sanity.error} action="read" onRetry={sanity.refetch} retryLabel="Check the contracts again" live={false} />
      )}

      {blockingError && (
        <>
          <ErrorNote
            error={blockingError}
            action="send"
            walletName={hubWallet.walletName}
            onRetry={
              canUnpick && blockingKid !== undefined
                ? () => unpick(blockingKid)
                : send.error
                  ? undefined
                  : estimate.refetch
            }
            retryLabel={canUnpick ? `Take #${blockingKid} out` : 'Check again'}
          />
          {mightHaveLanded && (
            <p className="hint">
              Before sending again, check <a href="#/kids">My kids</a> in case it went through.
            </p>
          )}
        </>
      )}

      <div className="row">
        <button type="button" className="btn ghost" onClick={() => update({ step: 'pick' })} disabled={sending}>
          ← Back
        </button>
        <button
          type="button"
          className="btn"
          disabled={disabled}
          aria-describedby={reason ? whyId : undefined}
          onClick={() => void onSend()}
        >
          {label}
        </button>
      </div>
      {reason && !sending ? (
        <p className="hint why" id={whyId}>
          {reason}
        </p>
      ) : (
        <p className="hint">
          {sending
            ? signed.done
              ? 'Signed. Waiting for the Hub to put it in a block…'
              : `Approve it in ${walletName}. Once signed, it lands on the Hub in a few seconds.`
            : `${walletName === 'your wallet' ? 'Your wallet' : walletName} asks you to sign once${n > 1 ? `, for all ${n} kids` : ''}.`}
          {estimate.data && !estimate.error && <> ≈ {formatFee(estimate.data)} network fee.</>}
        </p>
      )}
    </>
  )
}

/**
 * Guesses when the wallet prompt was approved: the page loses focus when the wallet's popup opens and gets it
 * back when the popup closes, while the send is still waiting for its block. The writer has no "signed"
 * callback, so this only changes a label. Wallets without a popup just stay on "Check Keplr…".
 */
function useSignedWhile(pending: boolean): { done: boolean; reset: () => void } {
  const [phase, setPhase] = useState<'idle' | 'away' | 'back'>('idle')
  useEffect(() => {
    if (!pending) return
    const away = () => setPhase('away')
    const back = () => setPhase((p) => (p === 'away' ? 'back' : p))
    window.addEventListener('blur', away)
    window.addEventListener('focus', back)
    return () => {
      window.removeEventListener('blur', away)
      window.removeEventListener('focus', back)
    }
  }, [pending])
  return { done: pending && phase === 'back', reset: () => setPhase('idle') }
}

function RecipientHint({
  id,
  check,
  auto,
  connected,
  walletName,
}: {
  id: string
  check: RecipientCheck | null
  auto: boolean
  connected: EthAddress | undefined
  walletName: string | undefined
}) {
  if (!check) {
    return (
      <p className="hint" id={id}>
        {connected ? 'Paste the Ethereum address your kids should land at.' : 'Connect Ethereum to fill this in, or paste any Ethereum address.'}
      </p>
    )
  }
  if (!check.ok) {
    return (
      <p className="hint bad" id={id}>
        {BAD_ADDRESS[check.reason]}
      </p>
    )
  }
  if (check.isConnected) {
    return (
      <p className="hint" id={id}>
        {auto ? `Filled in from ${walletName ?? 'your wallet'}.` : "That's your connected wallet."} The kids get minted to this
        address.
      </p>
    )
  }
  if (connected) {
    return (
      <p className="hint heads-up" id={id}>
        <b>This isn't your connected wallet</b> ({shortAddress(connected)}). Make sure you control it: the kids get minted
        here and can't come back.
      </p>
    )
  }
  return (
    <p className="hint" id={id}>
      The kids get minted to this address. Make sure you control it.
    </p>
  )
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 4 L37 35 L3 35 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M20 15 L20 24 M20 29 L20 30" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}
