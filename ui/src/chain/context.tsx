import { createContext, useContext } from 'react'
import type { Deployment } from '../config/deployments'
import type { ProveKidWriter } from './prove'
import type { EthAddress, EthReader, EthWriter, HubAddress, HubReader, HubWriter, WalletState } from './types'

/** What every component reads chain state through. Filled by DemoBridgeProvider or RealBridgeProvider. */
export interface BridgeContextValue {
  /** The active deployment preset. */
  deployment: Deployment
  /** Hub reads. Always available, wallet or not. */
  hub: HubReader
  /** Ethereum reads. Always available, wallet or not. */
  eth: EthReader
  /** Keplr / Leap / Cosmostation / WalletConnect connection. */
  hubWallet: WalletState<HubAddress>
  /** Injected / WalletConnect / Coinbase connection. */
  ethWallet: WalletState<EthAddress>
  /** Hub signer; null until the Hub wallet is connected. */
  hubWriter: HubWriter | null
  /** Ethereum signer; null until the Ethereum wallet is connected. */
  ethWriter: EthWriter | null
  /** Proves and submits one pending kid straight from the browser; null until the Ethereum wallet is connected. */
  proveKid: ProveKidWriter | null
}

export const BridgeContext = createContext<BridgeContextValue | null>(null)

export function useBridge(): BridgeContextValue {
  const value = useContext(BridgeContext)
  if (!value) throw new Error('useBridge() needs a DemoBridgeProvider or RealBridgeProvider above it')
  return value
}
