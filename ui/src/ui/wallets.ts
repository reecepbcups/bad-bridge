import type { WalletOption } from '../chain/types'

// Where to get a wallet that isn't installed. Looked up by option id (a connector id or an EIP-6963 rdns),
// then by display name, lowercased. Unknown wallets just get no link.

const GET_IT: Readonly<Record<string, string>> = {
  keplr: 'https://www.keplr.app/get',
  leap: 'https://www.leapwallet.io/download',
  cosmostation: 'https://www.cosmostation.io/',
  injected: 'https://metamask.io/download/',
  metamask: 'https://metamask.io/download/',
  'io.metamask': 'https://metamask.io/download/',
  'io.rabby': 'https://rabby.io/',
  'com.coinbase.wallet': 'https://www.coinbase.com/wallet/downloads',
  'app.phantom': 'https://phantom.com/download',
  phantom: 'https://phantom.com/download',
  coinbasewallet: 'https://www.coinbase.com/wallet/downloads',
  'coinbase wallet': 'https://www.coinbase.com/wallet/downloads',
  rabby: 'https://rabby.io/',
}

/** Install page for a wallet option, or null when there's nothing to install (WalletConnect) or we don't know it. */
export function getItUrl(option: Pick<WalletOption, 'id' | 'name'>): string | null {
  return GET_IT[option.id.toLowerCase()] ?? GET_IT[option.name.toLowerCase()] ?? null
}

// connector ids of wallets that need no extension: a phone app or a QR code (wagmi, graz, the demo)
const WEB_WALLETS = new Set(['coinbasewalletsdk', 'coinbasewallet', 'walletconnect'])

/** Coinbase Wallet's SDK and WalletConnect: "installed" is always true for them, but nothing is. */
export function isWebWallet(option: Pick<WalletOption, 'id'>): boolean {
  return WEB_WALLETS.has(option.id.toLowerCase())
}

/** No browser extension to connect with: the case where a phone user needs the wallet app's own browser. */
export function noExtension(options: readonly WalletOption[]): boolean {
  return options.length > 0 && !options.some((o) => o.installed && !isWebWallet(o))
}

/**
 * Opens `url` in Keplr Mobile's in-app browser. The universal link from Keplr's deeplink docs
 * (chainapsis/keplr-wallet docs/mobile/deeplink.md): works on iOS and Android, and falls back to keplr.app without the app.
 */
export function keplrBrowserLink(url: string): string {
  return `https://deeplink.keplr.app/web-browser?url=${encodeURIComponent(url)}`
}

/** Opens `url` in MetaMask Mobile's in-app browser (MetaMask's documented dapp deeplink, no scheme in the path). */
export function metamaskBrowserLink(url: string): string {
  return `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}`
}
