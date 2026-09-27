// Workstream A owns src/chain/hub/. Phase 0 stubs: the signatures are the contract, the bodies throw.
// Keep heavy imports (graz, cosmjs) out of modules the demo build touches; real.tsx is lazy-loaded.

import type { Deployment } from '../../config/deployments'
import type { HubAddress, HubReader, HubWriter, WalletState } from '../types'

export { HubWalletProvider } from './provider'

function notImplemented(what: string): never {
  throw new Error(`${what}: not implemented yet (Workstream A, src/chain/hub)`)
}

/** HubReader over REST with the RPC fallback list, retries and paging. */
export function createHubReader(_deployment: Deployment): HubReader {
  return notImplemented('createHubReader')
}

/** graz-backed Hub wallet (Keplr, Leap, Cosmostation, WalletConnect). Call under HubWalletProvider. */
export function useHubWallet(_deployment: Deployment): WalletState<HubAddress> {
  return notImplemented('useHubWallet')
}

/** Signer for the connected Hub wallet, or null while disconnected. Call under HubWalletProvider. */
export function useHubWriter(_deployment: Deployment): HubWriter | null {
  return notImplemented('useHubWriter')
}
