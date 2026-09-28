import type { ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import type { Deployment } from '../../config/deployments'
import { wagmiConfigFor } from './config'

/**
 * WagmiProvider over the deployment's wagmi config. Needs a QueryClientProvider above it (App.tsx has one).
 * reconnectOnMount (wagmi's default) restores the last wallet after a reload.
 */
export function EthWalletProvider({ deployment, children }: { deployment: Deployment; children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfigFor(deployment)} reconnectOnMount>
      {children}
    </WagmiProvider>
  )
}
