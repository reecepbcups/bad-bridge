import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Deployment } from '../config/deployments'
import { BridgeContext, type BridgeContextValue } from './context'
import { createEthReader } from './eth/reader'
import { createHubReader } from './hub/reader'
import { BridgeError, type WalletState } from './types'
import type { Wallets } from './wallets'

// The wallet libraries (graz, cosmjs signing, wagmi, WalletConnect) are most of the real bundle. They load in
// their own chunk, beside the page instead of above it, so the tracker, a kid's page and About render from the
// readers alone while the wallets load.
const RealWallets = lazy(() => import('./wallets'))

/** A wallet whose code is still downloading. Reads as connecting, like wagmi's own reconnect on load. */
function loadingWallet<A extends string>(): WalletState<A> {
  return {
    status: 'connecting',
    options: [],
    connect: () => Promise.reject(new BridgeError('Unknown', 'the wallet code is still loading; try again in a moment')),
    disconnect: () => Promise.resolve(),
  }
}

const LOADING: Wallets = { hubWallet: loadingWallet(), ethWallet: loadingWallet(), hubWriter: null, ethWriter: null }

/**
 * Real chain adapters: Hub (cosmjs over REST/RPC, graz for wallets) and Ethereum (viem, wagmi for wallets).
 * App lazy-loads this file, so the demo bundle never pulls in any of it.
 */
export default function RealBridgeProvider({ deployment, children }: { deployment: Deployment; children: ReactNode }) {
  const hub = useMemo(() => createHubReader(deployment), [deployment])
  const eth = useMemo(() => createEthReader(deployment), [deployment])
  const [wallets, setWallets] = useState<Wallets>(LOADING)
  const onWallets = useCallback((next: Wallets) => setWallets(next), [])
  const value = useMemo<BridgeContextValue>(() => ({ deployment, hub, eth, ...wallets }), [deployment, hub, eth, wallets])
  return (
    <>
      {/* a sibling, not a parent: when it arrives, nothing below re-mounts */}
      <Suspense fallback={null}>
        <RealWallets deployment={deployment} onChange={onWallets} />
      </Suspense>
      <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>
    </>
  )
}
