import { useEffect, useRef, useState } from 'react'
import { useBridge } from '../../chain/context'
import type { WalletState } from '../../chain/types'
import { CHAIN_NAME, ConnectSheet, type Chain } from '../Connect'
import { shortAddress } from '../format'
import { useCopy } from '../hooks'
import { Sheet } from '../Sheet'
import './Header.css'

const CHIP: Readonly<Record<Chain, { label: string; color: string }>> = {
  hub: { label: 'Hub', color: 'var(--hub)' },
  eth: { label: 'Ethereum', color: 'var(--eth)' },
}

export function Header() {
  const { hubWallet, ethWallet } = useBridge()
  return (
    <header className="header">
      <Logo />
      <div className="wallets">
        <WalletChip chain="hub" wallet={hubWallet} />
        <WalletChip chain="eth" wallet={ethWallet} />
      </div>
    </header>
  )
}

export function Logo() {
  return (
    <div>
      <h1 className="logo">
        <span className="bad">bad</span> bridge
      </h1>
      <svg viewBox="0 0 180 16" aria-hidden="true">
        <path d="M3 12 Q45 2 90 9 T177 6" fill="none" stroke="var(--crayon)" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}

/** "Connect Hub". Disabled while the wallet code loads or reconnects, with the same label so nothing shifts. */
export function ConnectChip({ chain, disabled, onClick }: { chain: Chain; disabled: boolean; onClick?: () => void }) {
  return (
    <button type="button" className="chip off" disabled={disabled} onClick={onClick}>
      <span className="dot" style={{ color: CHIP[chain].color }} />
      Connect {CHIP[chain].label}
    </button>
  )
}

/** Connected: the chain and the short address; click for the full address and disconnect. Otherwise a connect button. */
function WalletChip({ chain, wallet }: { chain: Chain; wallet: WalletState }) {
  // two sheets, two flags: one shared flag would pop "Your wallet" open the moment a connect lands
  const [meOpen, setMeOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const chip = useRef<HTMLButtonElement>(null)
  // set by a connect from this chip's sheet: the sheet and its opener are gone, so focus the new chip
  const focusChip = useRef(false)
  const name = CHAIN_NAME[chain]
  const connected = wallet.status === 'connected' && Boolean(wallet.address)
  useEffect(() => {
    if (connected && focusChip.current && chip.current) {
      focusChip.current = false
      chip.current.focus()
    }
  })

  if (connected && wallet.address) {
    return (
      <>
        <button
          ref={chip}
          type="button"
          className="chip"
          title={`${name}: ${wallet.address}${wallet.walletName ? ` (${wallet.walletName})` : ''}`}
          onClick={() => setMeOpen(true)}
        >
          <span className="dot" style={{ background: CHIP[chain].color }} />
          <span className="chip-text">
            <span className="chip-chain">{name}</span> <span>{shortAddress(wallet.address)}</span>
          </span>
        </button>
        <Sheet open={meOpen} onClose={() => setMeOpen(false)} title={`Your ${name} wallet`}>
          <WalletMe wallet={wallet} onDone={() => setMeOpen(false)} />
        </Sheet>
      </>
    )
  }
  return (
    <>
      <ConnectChip chain={chain} disabled={wallet.status === 'connecting'} onClick={() => setConnectOpen(true)} />
      <ConnectSheet
        chain={chain}
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onConnected={() => {
          // the chip may already be up (then focus it now) or come with the next render (then the effect does)
          if (chip.current) chip.current.focus()
          else focusChip.current = true
        }}
      />
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
