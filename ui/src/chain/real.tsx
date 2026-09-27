import { useMemo, type ReactNode } from 'react'
import type { Deployment } from '../config/deployments'
import { BridgeContext, type BridgeContextValue } from './context'
import { createEthReader, EthWalletProvider, useEthWallet, useEthWriter } from './eth'
import { createHubReader, HubWalletProvider, useHubWallet, useHubWriter } from './hub'

/**
 * Real chain adapters: Hub (graz + cosmjs) and Ethereum (wagmi + viem). Throws until Workstreams A and B
 * replace their stubs; App lazy-loads this file so the demo bundle never pulls in the wallet libraries.
 */
export default function RealBridgeProvider({ deployment, children }: { deployment: Deployment; children: ReactNode }) {
  return (
    <EthWalletProvider deployment={deployment}>
      <HubWalletProvider deployment={deployment}>
        <RealBridge deployment={deployment}>{children}</RealBridge>
      </HubWalletProvider>
    </EthWalletProvider>
  )
}

function RealBridge({ deployment, children }: { deployment: Deployment; children: ReactNode }) {
  const hub = useMemo(() => createHubReader(deployment), [deployment])
  const eth = useMemo(() => createEthReader(deployment), [deployment])
  const hubWallet = useHubWallet(deployment)
  const ethWallet = useEthWallet(deployment)
  const hubWriter = useHubWriter(deployment)
  const ethWriter = useEthWriter(deployment)
  const value = useMemo<BridgeContextValue>(
    () => ({ deployment, hub, eth, hubWallet, ethWallet, hubWriter, ethWriter }),
    [deployment, hub, eth, hubWallet, ethWallet, hubWriter, ethWriter],
  )
  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>
}
