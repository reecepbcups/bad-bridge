import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { BridgeContext, type BridgeContextValue } from '../chain/context'
import type { WalletOption, WalletState } from '../chain/types'
import { DEPLOYMENTS } from '../config/deployments'
import { ConnectSheet, WalletOptions } from './Connect'

function wallet(options: WalletOption[]): WalletState {
  return { status: 'disconnected', options, connect: () => Promise.resolve(), disconnect: () => Promise.resolve() }
}

function withWallets(hub: WalletOption[], eth: WalletOption[]) {
  const value = { deployment: DEPLOYMENTS.demo, hubWallet: wallet(hub), ethWallet: wallet(eth), hubWriter: null, ethWriter: null } as unknown as BridgeContextValue
  return ({ children }: { children: ReactNode }) => <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>
}

const NO_HUB = [
  { id: 'keplr', name: 'Keplr', installed: false },
  { id: 'leap', name: 'Leap', installed: false },
]
const WEB_ONLY = [{ id: 'coinbaseWalletSDK', name: 'Coinbase Wallet', installed: true }]

describe('WalletOptions on a phone (no extension)', () => {
  it('sends Hub holders to Keplr or Leap’s own browser, with install links second', () => {
    render(<WalletOptions chain="hub" />, { wrapper: withWallets(NO_HUB, WEB_ONLY) })
    expect(screen.getByText(/Open this page in the Keplr or Leap app's browser/)).toBeInTheDocument()
    const open = screen.getByRole('link', { name: 'Open in Keplr' })
    expect(open.getAttribute('href')).toMatch(/^https:\/\/deeplink\.keplr\.app\/web-browser\?url=http/)
    expect(screen.getByRole('button', { name: "Copy this page's link" })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Cosmos Hub wallets' })
    expect(within(list).getByRole('link', { name: /Get it \(Keplr\) \(opens in a new tab\)/ })).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('tells Ethereum users about wallet app browsers, and calls web wallets "app or QR code"', () => {
    render(<ConnectSheet chain="eth" open onClose={() => undefined} />, { wrapper: withWallets(NO_HUB, WEB_ONLY) })
    expect(screen.getByText(/Open this page in your wallet app's browser \(MetaMask, Rainbow, Coinbase Wallet\)/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in MetaMask' }).getAttribute('href')).toMatch(/^https:\/\/metamask\.app\.link\/dapp\//)
    expect(screen.getByText('app or QR code')).toBeInTheDocument()
    expect(screen.queryByText(/paste any address/)).toBeNull()
  })

  it('says nothing about phones when an extension is there', () => {
    render(<WalletOptions chain="hub" />, { wrapper: withWallets([{ id: 'keplr', name: 'Keplr', installed: true }], WEB_ONLY) })
    expect(screen.queryByText(/On your phone/)).toBeNull()
    expect(screen.getByText('installed')).toBeInTheDocument()
  })
})
