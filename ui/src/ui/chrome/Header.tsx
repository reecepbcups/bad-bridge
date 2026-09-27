import { useState } from 'react'
import { useBridge } from '../../chain/context'
import type { WalletState } from '../../chain/types'
import { CHAIN_NAME, ConnectSheet, type Chain } from '../Connect'
import { shortAddress } from '../format'
import { useCopy } from '../hooks'
import { Sheet } from '../Sheet'
import './Header.css'

export function Header() {
  const { hubWallet, ethWallet } = useBridge()
  return (
    <header className="header">
      <div>
        <h1 className="logo">
          <span className="bad">bad</span> bridge
        </h1>
        <svg viewBox="0 0 180 16" aria-hidden="true">
          <path d="M3 12 Q45 2 90 9 T177 6" fill="none" stroke="var(--crayon)" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="wallets">
        <WalletChip chain="hub" color="var(--hub)" wallet={hubWallet} />
        <WalletChip chain="eth" color="var(--eth)" wallet={ethWallet} />
      </div>
    </header>
  )
}

/** Connected: the short address, like the mockup; click for the full address and disconnect. Otherwise a connect button. */
function WalletChip({ chain, color, wallet }: { chain: Chain; color: string; wallet: WalletState }) {
  const [open, setOpen] = useState(false)
  const name = CHAIN_NAME[chain]
  if (wallet.status === 'connected' && wallet.address) {
    return (
      <>
        <button
          type="button"
          className="chip"
          title={`${name}: ${wallet.address}${wallet.walletName ? ` (${wallet.walletName})` : ''}`}
          onClick={() => setOpen(true)}
        >
          <span className="dot" style={{ background: color }} />
          <span className="sr-only">{name} wallet </span>
          {shortAddress(wallet.address)}
        </button>
        <Sheet open={open} onClose={() => setOpen(false)} title={`Your ${name} wallet`}>
          <WalletMe wallet={wallet} onDone={() => setOpen(false)} />
        </Sheet>
      </>
    )
  }
  return (
    <>
      <button type="button" className="chip off" disabled={wallet.status === 'connecting'} onClick={() => setOpen(true)}>
        <span className="dot" style={{ color }} />
        {wallet.status === 'connecting' ? 'connecting…' : `connect ${name}`}
      </button>
      <ConnectSheet chain={chain} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function WalletMe({ wallet, onDone }: { wallet: WalletState; onDone: () => void }) {
  const { copy, copied } = useCopy()
  const address = wallet.address ?? ''
  return (
    <>
      <div className="wallet-me">
        <span className="muted">Connected{wallet.walletName ? ` with ${wallet.walletName}` : ''}</span>
        <span className="mono">{address}</span>
      </div>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => void copy(address)}>
          {copied ? 'Copied!' : 'Copy address'}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            void wallet.disconnect()
            onDone()
          }}
        >
          Disconnect
        </button>
      </div>
    </>
  )
}
