import { useBridge } from '../../chain/context'
import type { WalletState } from '../../chain/types'
import { shortAddress } from '../format'
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
        <WalletChip chain="Cosmos Hub" color="var(--hub)" wallet={hubWallet} />
        <WalletChip chain="Ethereum" color="var(--eth)" wallet={ethWallet} />
      </div>
    </header>
  )
}

/**
 * Connected: the short address, like the mockup. Otherwise a button that connects the first installed
 * wallet. Phase 0 placeholder; the UI workstream replaces the click with a connect sheet.
 */
function WalletChip({ chain, color, wallet }: { chain: string; color: string; wallet: WalletState }) {
  if (wallet.status === 'connected' && wallet.address) {
    return (
      <span className="chip" title={`${chain}: ${wallet.address}${wallet.walletName ? ` (${wallet.walletName})` : ''}`}>
        <span className="dot" style={{ background: color }} />
        <span className="sr-only">{chain} </span>
        {shortAddress(wallet.address)}
      </span>
    )
  }
  const option = wallet.options.find((o) => o.installed)
  return (
    <button
      type="button"
      className="chip off"
      disabled={wallet.status === 'connecting' || !option}
      onClick={() => option && wallet.connect(option.id).catch(() => undefined)}
    >
      <span className="dot" style={{ color }} />
      {wallet.status === 'connecting' ? 'connecting…' : `connect ${chain}`}
    </button>
  )
}
