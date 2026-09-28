import { useState } from 'react'
import { useBridge } from '../chain/context'
import { ErrorNote } from './ErrorNote'

/**
 * The Ethereum wallet is on another network. Offers a one-click switch when the wallet supports it,
 * plain instructions when it doesn't.
 */
export function SwitchChain() {
  const { ethWallet } = useBridge()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const name = ethWallet.walletName ?? 'your wallet'
  const switchChain = ethWallet.switchChain

  if (!switchChain) {
    return (
      <p className="hint center">
        {name === 'your wallet' ? 'Your wallet' : name} is on another network. Open it, switch the network to{' '}
        <b>Ethereum mainnet</b>, then claim again.
      </p>
    )
  }

  const onSwitch = async () => {
    setBusy(true)
    setError(null)
    try {
      await switchChain()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="switch-chain">
      <p className="hint center">{name === 'your wallet' ? 'Your wallet' : name} is on another network.</p>
      <div className="row center">
        <button type="button" className="btn eth" disabled={busy} onClick={() => void onSwitch()}>
          {busy ? `Check ${name}…` : 'Switch to Ethereum'}
        </button>
      </div>
      {error !== null && <ErrorNote error={error} action="claim" walletName={ethWallet.walletName} />}
    </div>
  )
}
