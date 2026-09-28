import { describe, expect, it } from 'vitest'
import { getItUrl, isWebWallet, keplrBrowserLink, metamaskBrowserLink, noExtension } from './wallets'

describe('wallets', () => {
  it('tells web wallets from extensions', () => {
    expect(['coinbaseWalletSDK', 'walletConnect', 'walletconnect', 'coinbaseWallet'].every((id) => isWebWallet({ id }))).toBe(true)
    expect(['keplr', 'injected', 'io.metamask'].some((id) => isWebWallet({ id }))).toBe(false)
  })

  it('spots a browser with no wallet extension', () => {
    const keplr = { id: 'keplr', name: 'Keplr', installed: false }
    const coinbase = { id: 'coinbaseWalletSDK', name: 'Coinbase Wallet', installed: true }
    expect(noExtension([keplr])).toBe(true)
    expect(noExtension([coinbase])).toBe(true)
    expect(noExtension([{ ...keplr, installed: true }, coinbase])).toBe(false)
    // still loading: nothing to say yet
    expect(noExtension([])).toBe(false)
  })

  it('builds in-app browser links', () => {
    expect(keplrBrowserLink('https://bridge.example/?x=1#/kids')).toBe(
      'https://deeplink.keplr.app/web-browser?url=https%3A%2F%2Fbridge.example%2F%3Fx%3D1%23%2Fkids',
    )
    expect(metamaskBrowserLink('https://bridge.example/#/')).toBe('https://metamask.app.link/dapp/bridge.example/#/')
  })

  it('knows where to get the usual wallets', () => {
    expect(getItUrl({ id: 'leap', name: 'Leap' })).toBe('https://www.leapwallet.io/download')
    expect(getItUrl({ id: 'walletConnect', name: 'WalletConnect' })).toBeNull()
  })
})
