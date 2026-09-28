import { useEffect, useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { useBridge } from '../chain/context'
import { MIN_DEPOSIT } from '../chain/prove'
import type { BatchStage, BridgeError } from '../chain/types'
import { ConnectButton } from './Connect'
import { ErrorNote } from './ErrorNote'
import { ExtLink } from './ExtLink'
import { Sheet } from './Sheet'
import { useToast } from './Toasts'

const PROVE_ACCOUNT_URL = 'https://explorer.succinct.xyz/account'
const DEFAULT_AMOUNT = '1'

// COPY: get PROVE progress
const STAGE_LABEL: Readonly<Record<BatchStage, string>> = {
  signing: 'Check your wallet…',
  confirming: 'Waiting for Ethereum…',
}

function parseAmount(text: string): bigint | null {
  if (!/^\d*\.?\d+$|^\d+\.$/.test(text.trim())) return null
  try {
    return parseUnits(text.trim(), 18)
  } catch {
    return null
  }
}

/** Two decimals of a wei-like amount, for reading, never for math. */
function short(wei: bigint): string {
  return Number(formatUnits(wei, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })
}

/** Opens the swap and deposit modal. Without an Ethereum wallet it falls back to Succinct's own page. */
export function GetProveButton({ className = 'btn ghost small' }: { className?: string }) {
  const { proveKid } = useBridge()
  const [open, setOpen] = useState(false)
  if (!proveKid) return <ExtLink href={PROVE_ACCOUNT_URL}>Get PROVE</ExtLink>
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Get PROVE
      </button>
      <GetProveSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * Buy PROVE with ETH on Uniswap, then deposit it into your Succinct network account, which is what proving draws
 * from. Each step is its own button, so a user who already holds PROVE can skip to the deposit.
 */
function GetProveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ethWallet, proveKid } = useBridge()
  const toast = useToast()
  const [text, setText] = useState(DEFAULT_AMOUNT)
  const [quote, setQuote] = useState<bigint | null>(null)
  const [held, setHeld] = useState<bigint | null>(null)
  const [network, setNetwork] = useState<bigint | null>(null)
  const [stage, setStage] = useState<BatchStage | null>(null)
  const [busy, setBusy] = useState<'buy' | 'deposit' | null>(null)
  const [error, setError] = useState<BridgeError | null>(null)
  const [tick, setTick] = useState(0)

  const amount = parseAmount(text)
  const validAmount = amount !== null && amount >= MIN_DEPOSIT
  const connected = ethWallet.status === 'connected'

  useEffect(() => {
    if (!open || !proveKid || !connected) return
    let cancelled = false
    void proveKid.walletProveBalance().then((w) => !cancelled && setHeld(w)).catch(() => undefined)
    void proveKid.proveBalance().then((w) => !cancelled && setNetwork(w)).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, proveKid, connected, tick])

  useEffect(() => {
    if (!open || !proveKid || !connected || !validAmount) return
    let cancelled = false
    // a short wait, so typing doesn't ask the router on every key
    const timer = setTimeout(() => {
      setQuote(null)
      void proveKid.quoteProve(amount).then((q) => !cancelled && setQuote(q)).catch(() => undefined)
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, proveKid, connected, validAmount, amount])

  if (!proveKid) return null

  const run = async (kind: 'buy' | 'deposit', fn: () => Promise<unknown>, done: string) => {
    if (busy) return
    setBusy(kind)
    setError(null)
    try {
      await fn()
      toast({ tone: 'ok', title: done })
      setTick((t) => t + 1)
    } catch (e) {
      setError(e as BridgeError)
    } finally {
      setBusy(null)
      setStage(null)
    }
  }
  const enough = held !== null && amount !== null && held >= amount
  const label = (kind: 'buy' | 'deposit', idle: string) => (busy === kind && stage ? STAGE_LABEL[stage] : idle)

  return (
    <Sheet open={open} onClose={onClose} title="Get PROVE">
      <p className="lede">
        Proving costs PROVE, paid to Succinct's prover network from an account there. Buy some with ETH, then deposit it.
        About 0.33 covers 10 kids.
        {/* COPY: get PROVE intro */}
      </p>
      {!connected ? (
        <ConnectButton chain="eth" className="btn eth">
          Connect Ethereum
        </ConnectButton>
      ) : (
        <>
          <p className="hint">
            In your wallet: <b>{held === null ? '…' : `${short(held)} PROVE`}</b> · In your Succinct account:{' '}
            <b>{network === null ? '…' : `${short(network)} PROVE`}</b>
          </p>
          <label className="hint" htmlFor="get-prove-amount">
            How much PROVE
          </label>
          <input id="get-prove-amount" type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          {!validAmount && <p className="hint bad">Enter 0.01 PROVE or more.</p>}

          <ol className="stages">
            <li>
              <b>1. Buy on Uniswap</b>
              <span className="d">
                {validAmount && quote !== null ? `About ${short(quote)} ETH, up to 5% more if the price moves. The rest comes back.` : 'Getting a price…'}{' '}
                The pool is small, so big amounts cost noticeably more.
              </span>
              <button
                type="button"
                className="btn eth"
                disabled={!validAmount || quote === null || enough}
                aria-disabled={busy !== null || undefined}
                onClick={() => amount !== null && void run('buy', () => proveKid.buyProve(amount, { onStage: setStage }), 'Bought PROVE')}
              >
                {enough ? 'You already have enough' : label('buy', 'Buy PROVE')}
              </button>
            </li>
            <li>
              <b>2. Deposit into Succinct</b>
              <span className="d">One signature to approve, then one transaction. It goes to your own account.</span>
              <button
                type="button"
                className="btn eth"
                disabled={!validAmount || held === null || (amount !== null && held < amount)}
                aria-disabled={busy !== null || undefined}
                onClick={() => amount !== null && void run('deposit', () => proveKid.depositProve(amount, { onStage: setStage }), 'Deposited into Succinct')}
              >
                {label('deposit', 'Deposit PROVE')}
              </button>
            </li>
          </ol>
          {error && <ErrorNote error={error} action="send" walletName={ethWallet.walletName} />}
        </>
      )}
    </Sheet>
  )
}
