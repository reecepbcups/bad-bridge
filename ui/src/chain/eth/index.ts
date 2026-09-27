// Workstream B owns src/chain/eth/. Phase 0 stubs: the signatures are the contract, the bodies throw.
// Keep heavy imports (wagmi, connectors) out of modules the demo build touches; real.tsx is lazy-loaded.

import type { Config } from 'wagmi'
import type { Deployment } from '../../config/deployments'
import type { EthAddress, EthReader, EthWriter, WalletState } from '../types'

export { EthWalletProvider } from './provider'
export { checkRecipient, type RecipientCheck } from './recipient'

function notImplemented(what: string): never {
  throw new Error(`${what}: not implemented yet (Workstream B, src/chain/eth)`)
}

/** wagmi config: mainnet, the deployment's RPCs, injected (EIP-6963), WalletConnect (only with a project id), Coinbase. */
export function createWagmiConfig(_deployment: Deployment): Config {
  return notImplemented('createWagmiConfig')
}

/** EthReader over viem with Multicall3 batching. */
export function createEthReader(_deployment: Deployment): EthReader {
  return notImplemented('createEthReader')
}

/** wagmi-backed Ethereum wallet. Call under EthWalletProvider. */
export function useEthWallet(_deployment: Deployment): WalletState<EthAddress> {
  return notImplemented('useEthWallet')
}

/** Signer for the connected Ethereum wallet, or null while disconnected. Call under EthWalletProvider. */
export function useEthWriter(_deployment: Deployment): EthWriter | null {
  return notImplemented('useEthWriter')
}
