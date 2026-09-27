import { useState, type ReactNode } from 'react'
import { useBridge } from '../chain/context'
import type { WalletState } from '../chain/types'
import { ErrorNote } from './ErrorNote'
import { Sheet } from './Sheet'
import { getItUrl } from './wallets'

export type Chain = 'hub' | 'eth'

export const CHAIN_NAME: Readonly<Record<Chain, string>> = { hub: 'Cosmos Hub', eth: 'Ethereum' }

function useWallet(chain: Chain): WalletState {
  const { hubWallet, ethWallet } = useBridge()
  return chain === 'hub' ? hubWallet : ethWallet
}

/**
 * The wallets a chain can connect with: installed ones get a Connect button, missing ones a "get it" link.
 * `onConnected` runs after a successful connect (closing a sheet, say).
 */
export function WalletOptions({ chain, onConnected }: { chain: Chain; onConnected?: () => void }) {
  const wallet = useWallet(chain)
  const [trying, setTrying] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ error: unknown; name: string } | null>(null)
  const busy = wallet.status === 'connecting' || trying !== null

  const connect = async (id: string, name: string) => {
    setTrying(id)
    setFailure(null)
    try {
      await wallet.connect(id)
      onConnected?.()
    } catch (error) {
      setFailure({ error, name })
    } finally {
      setTrying(null)
    }
  }

  return (
    <div className="wallet-choose">
      <ul className="wallet-list" aria-label={`${CHAIN_NAME[chain]} wallets`}>
        {wallet.options.map((o) => {
          const getIt = o.installed ? null : getItUrl(o)
          return (
            <li key={o.id} className={o.installed ? 'wallet-opt' : 'wallet-opt missing'}>
              <span className="who">
                {o.icon ? (
                  <img className="icon" src={o.icon} alt="" width={28} height={28} />
                ) : (
                  <span className="icon letter" aria-hidden="true">
                    {o.name.slice(0, 1)}
                  </span>
                )}
                <span className="name">{o.name}</span>
                <span className={o.installed ? 'tag on' : 'tag'}>{o.installed ? 'installed' : 'not installed'}</span>
              </span>
              {o.installed ? (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  aria-label={`Connect ${o.name}`}
                  onClick={() => void connect(o.id, o.name)}
                >
                  {trying === o.id ? 'Connecting…' : 'Connect'}
                </button>
              ) : getIt ? (
                <a className="get" href={getIt} target="_blank" rel="noopener">
                  Get it<span className="sr-only"> ({o.name})</span> ↗
                </a>
              ) : null}
            </li>
          )
        })}
      </ul>
      {wallet.options.length === 0 && (
        <p className="muted" role="status">
          {wallet.status === 'connecting' ? 'Looking for wallets…' : 'No wallets found in this browser.'}
        </p>
      )}
      {failure && <ErrorNote error={failure.error} action="connect" walletName={failure.name} />}
    </div>
  )
}

/** A button that opens the connect sheet for one chain. */
export function ConnectButton({
  chain,
  className = 'btn',
  children,
}: {
  chain: Chain
  className?: string
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const wallet = useWallet(chain)
  return (
    <>
      <button type="button" className={className} disabled={wallet.status === 'connecting'} onClick={() => setOpen(true)}>
        {wallet.status === 'connecting' ? 'Connecting…' : (children ?? `Connect ${CHAIN_NAME[chain]}`)}
      </button>
      <ConnectSheet chain={chain} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** The connect sheet: pick a wallet for `chain`. Closes itself once connected. */
export function ConnectSheet({ chain, open, onClose }: { chain: Chain; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`Connect ${CHAIN_NAME[chain]}`}>
      <p className="lede sheet-lede">
        {chain === 'hub'
          ? 'Pick the wallet that holds your Bad Kids on the Cosmos Hub.'
          : 'Pick the wallet you use on Ethereum. You can also paste any address instead.'}
        {/* COPY: connect sheet ledes */}
      </p>
      <WalletOptions chain={chain} onConnected={onClose} />
    </Sheet>
  )
}
