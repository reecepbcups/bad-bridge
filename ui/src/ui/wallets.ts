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
