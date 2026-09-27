import { useState, type ReactNode } from 'react'
import { useBridge } from '../chain/context'
import type { WalletState } from '../chain/types'
import { ErrorNote } from './ErrorNote'
import { ExtLink } from './ExtLink'
import { ShareLink } from './ShareLink'
import { Sheet } from './Sheet'
import { getItUrl, isWebWallet, keplrBrowserLink, metamaskBrowserLink, noExtension } from './wallets'

export type Chain = 'hub' | 'eth'

export const CHAIN_NAME: Readonly<Record<Chain, string>> = { hub: 'Cosmos Hub', eth: 'Ethereum' }

function useWallet(chain: Chain): WalletState {
  const { hubWallet, ethWallet } = useBridge()
  return chain === 'hub' ? hubWallet : ethWallet
}

/**
 * The wallets a chain can connect with: installed ones get a Connect button, missing ones a "get it" link.
 * With no extension at all, it first points phone users at their wallet app's browser.
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
      {noExtension(wallet.options) && <OnYourPhone chain={chain} />}
      <ul className="wallet-list" aria-label={`${CHAIN_NAME[chain]} wallets`}>
        {wallet.options.map((o) => {
          const getIt = o.installed ? null : getItUrl(o)
          // COPY: wallet tags
          const tag = !o.installed ? 'not installed' : isWebWallet(o) ? 'app or QR code' : 'installed'
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
                <span className={o.installed ? 'tag on' : 'tag'}>{tag}</span>
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
                <ExtLink className="get" href={getIt}>
                  Get it <span className="sr-only">({o.name})</span>
                </ExtLink>
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

/**
 * A phone browser has no wallet extensions: the wallet apps have their own browsers instead. Keplr has a documented
 * link that opens a page in its browser; Leap's links are made per site, so for Leap it's copy and paste.
 */
function OnYourPhone({ chain }: { chain: Chain }) {
  const here = location.href
  return (
    <div className="phone-hint">
      <p>
        <b>On your phone?</b>{' '}
        {chain === 'hub'
          ? "Open this page in the Keplr or Leap app's browser."
          : "Open this page in your wallet app's browser (MetaMask, Rainbow, Coinbase Wallet)."}
        {/* COPY: on your phone */}
      </p>
      <div className="row start">
        {chain === 'hub' ? (
          <a className="btn small" href={keplrBrowserLink(here)}>
            Open in Keplr
          </a>
        ) : (
          <a className="btn small" href={metamaskBrowserLink(here)}>
            Open in MetaMask
          </a>
        )}
        <ShareLink hash={location.hash || '#/'} label="Copy this page's link" />
      </div>
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

/** The connect sheet: pick a wallet for `chain`. Closes itself once connected, after calling `onConnected`. */
export function ConnectSheet({
  chain,
  open,
  onClose,
  onConnected,
}: {
  chain: Chain
  open: boolean
  onClose: () => void
  onConnected?: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Connect ${CHAIN_NAME[chain]}`}>
      <p className="lede sheet-lede">
        {chain === 'hub' ? 'Pick the wallet that holds your Bad Kids on the Cosmos Hub.' : 'Pick the wallet you use on Ethereum.'}
        {/* COPY: connect sheet ledes */}
      </p>
      <WalletOptions
        chain={chain}
        onConnected={() => {
          onConnected?.()
          onClose()
        }}
      />
    </Sheet>
  )
}
