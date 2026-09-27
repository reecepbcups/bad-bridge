import type { ReactNode } from 'react'
import type { Deployment } from '../../config/deployments'

/** Wraps the tree in WagmiProvider with createWagmiConfig(deployment). Phase 0 stub: passes through. */
export function EthWalletProvider({ children }: { deployment: Deployment; children: ReactNode }) {
  return children
}
