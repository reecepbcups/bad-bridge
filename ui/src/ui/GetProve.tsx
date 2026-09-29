import { useEffect, useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { useBridge } from '../chain/context'
import { MIN_DEPOSIT } from '../chain/prove'
import type { BatchStage, BridgeError } from '../chain/types'
import { formatEth } from './Claim'
import { ConnectButton } from './Connect'
import { ErrorNote } from './ErrorNote'
import { ExtLink } from './ExtLink'
import { Sheet } from './Sheet'
import { useToast } from './Toasts'
import './GetProve.css'

const PROVE_ACCOUNT_URL = 'https://explorer.succinct.xyz/account'
const DEFAULT_AMOUNT = '1'
/** Gas used by the swap, measured with estimateGas on mainnet 2026-09-28 (155,742), rounded up. */
const SWAP_GAS = 160_000n
/** Above this, say so: it was 0.5 to 1.5 gwei on a quiet day. */
const HIGH_GWEI = 5n
/** Succinct credits a deposit only after it indexes the L1 event, so the balance lags the receipt. */
const CREDIT_POLL_MS = 4_000
const CREDIT_TIMEOUT_MS = 5 * 60_000

type Stage = BatchStage | 'crediting'

// COPY: get PROVE progress
const STAGE_LABEL: Readonly<Record<Stage, string>> = {
  signing: 'Check your wallet…',
  confirming: 'Waiting for Ethereum…',
  crediting: 'Waiting for Succinct to credit…',
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

/** Whole-dollar-ish display of a wei amount at `ethUsd` USD per ETH, for reading only. */
function usd(wei: bigint, ethUsd: number): string {
  const v = Number(formatUnits(wei, 18)) * ethUsd
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: v < 1 ? 2 : 0 })
}

/** Opens the swap and deposit modal. Without an Ethereum wallet it falls back to Succinct's own page. */
export function GetProveButton({
  className = 'btn ghost small',
  onChange,
  children = 'Get PROVE',
}: {
  className?: string
  onChange?: () => void
  children?: string
}) {
  const { proveKid } = useBridge()
  const [open, setOpen] = useState(false)
  if (!proveKid) return <ExtLink href={PROVE_ACCOUNT_URL}>Get PROVE</ExtLink>
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <GetProveSheet open={open} onClose={() => setOpen(false)} onChange={onChange} />
    </>
  )
}

/**
 * Buy PROVE with ETH on Uniswap, then deposit it into your Succinct network account, which is what proving draws
 * from. Each step is its own button, so a user who already holds PROVE can skip to the deposit.
 */
function GetProveSheet({ open, onClose, onChange }: { open: boolean; onClose: () => void; onChange?: () => void }) {
  const { ethWallet, proveKid } = useBridge()
  const toast = useToast()
  const [text, setText] = useState(DEFAULT_AMOUNT)
  const [quote, setQuote] = useState<bigint | null>(null)
  const [held, setHeld] = useState<bigint | null>(null)
  const [network, setNetwork] = useState<bigint | null>(null)
  const [stage, setStage] = useState<Stage | null>(null)
  const [busy, setBusy] = useState<'buy' | 'deposit' | null>(null)
  const [error, setError] = useState<BridgeError | null>(null)
  const [tick, setTick] = useState(0)
  const [ethUsd, setEthUsd] = useState<number | null>(null)
  const [gasPrice, setGasPrice] = useState<bigint | null>(null)

  const amount = parseAmount(text)
  const validAmount = amount !== null && amount >= MIN_DEPOSIT
  const connected = ethWallet.status === 'connected'

  useEffect(() => {
    if (!open || !proveKid || !connected) return
    let cancelled = false
    void proveKid.walletProveBalance().then((w) => !cancelled && setHeld(w)).catch(() => undefined)
    void proveKid.proveBalance().then((w) => !cancelled && setNetwork(w)).catch(() => undefined)
    void proveKid.ethUsdPrice().then((p) => !cancelled && setEthUsd(p)).catch(() => undefined)
    void proveKid.gasPrice().then((g) => !cancelled && setGasPrice(g)).catch(() => undefined)
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

  /** True once the network balance reaches `target`, false if Succinct hasn't credited it in time. */
  const waitForCredit = async (target: bigint) => {
    const deadline = Date.now() + CREDIT_TIMEOUT_MS
    while (Date.now() < deadline) {
      const bal = await proveKid.proveBalance().catch(() => null)
      if (bal !== null) {
        setNetwork(bal)
        if (bal >= target) return true
      }
      await new Promise((r) => setTimeout(r, CREDIT_POLL_MS))
    }
    return false
  }

  const deposit = async (value: bigint) => {
    const before = await proveKid.proveBalance()
    await proveKid.depositProve(value, { onStage: setStage })
    setStage('crediting')
    if (!(await waitForCredit(before + value))) {
      toast({ tone: 'ok', title: 'Deposit sent. Succinct is slow to credit it, check back in a few minutes.' })
    }
  }

  const run = async (kind: 'buy' | 'deposit', fn: () => Promise<unknown>, done: string) => {
    if (busy) return
    setBusy(kind)
    setError(null)
    try {
      await fn()
      toast({ tone: 'ok', title: done })
      setTick((t) => t + 1)
      onChange?.()
    } catch (e) {
      setError(e as BridgeError)
    } finally {
      setBusy(null)
      setStage(null)
    }
  }
  const gwei = gasPrice === null ? null : Number(gasPrice) / 1e9
  const gasHigh = gasPrice !== null && gasPrice > HIGH_GWEI * 10n ** 9n
  const enough = held !== null && amount !== null && held >= amount
  const label = (kind: 'buy' | 'deposit', idle: string) => (busy === kind && stage ? STAGE_LABEL[stage] : idle)

  return (
    <Sheet open={open} onClose={onClose} title="Get PROVE">
      <p className="lede">
        Proving costs PROVE, paid to Succinct's prover network from an account there. Buy some with ETH, then deposit it.
        One proof costs about 0.33, whether it carries 1 kid or up to 50.
        {/* COPY: get PROVE intro */}
      </p>
      {!connected ? (
        <ConnectButton chain="eth" className="btn eth">
          Connect Ethereum
        </ConnectButton>
      ) : (
        <div className="get-prove">
          <p className="hint">
            In your wallet: <b>{held === null ? '…' : `${short(held)} PROVE`}</b> · In your Succinct account:{' '}
            <b>{network === null ? '…' : `${short(network)} PROVE`}</b>
          </p>
          <label className="hint" htmlFor="get-prove-amount">
            How much PROVE
          </label>
          <input id="get-prove-amount" type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          {!validAmount && <p className="hint bad">Enter 0.01 PROVE or more.</p>}
          {gasHigh && gwei !== null && (
            <p className="hint" role="status">
              Gas is high right now ({gwei.toFixed(1)} gwei). It is often cheaper later, and nothing here is urgent.
              {/* COPY: high gas note */}
            </p>
          )}

          <ol className="prove-steps">
            <li>
              <b>1. Buy on Uniswap</b>
              <span className="d">
                {validAmount && quote !== null ? `About ${short(quote)} ETH${ethUsd !== null ? ` (${usd(quote, ethUsd)})` : ''}, up to 5% more if the price moves. The rest comes back.` : 'Getting a price…'}{' '}
                The pool is small, so big amounts cost noticeably more.
                {gasPrice !== null && <> Network fee for the swap: about {formatEth((SWAP_GAS * gasPrice).toString())}{ethUsd !== null && <> ({usd(SWAP_GAS * gasPrice, ethUsd)})</>} at {gwei?.toFixed(1)} gwei.</>}
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
              <span className="d">One signature to approve, then one transaction, with its own network fee. It goes to your own account.</span>
              <button
                type="button"
                className="btn eth"
                disabled={!validAmount || held === null || (amount !== null && held < amount)}
                aria-disabled={busy !== null || undefined}
                onClick={() => amount !== null && void run('deposit', () => deposit(amount), 'Deposited into Succinct')}
              >
                {label('deposit', 'Deposit PROVE')}
              </button>
            </li>
          </ol>
          {error && <ErrorNote error={error} action="send" walletName={ethWallet.walletName} />}
        </div>
      )}
    </Sheet>
  )
}
