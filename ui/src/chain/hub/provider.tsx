import { GrazProvider, WalletType, type ConfigureGrazArgs } from 'graz'
import { createContext, useEffect, useMemo, type ReactNode } from 'react'
import { wcProjectId, type Deployment } from '../../config/deployments'
import { hubChainInfo, GAS_PRICE_STEP } from './chainInfo'
import { createLeapConnector, type LeapConnector } from './leap'

export interface HubWalletContextValue {
  /** Leap lives outside graz (graz 0.7.0 dropped it). */
  leap: LeapConnector
}

export const HubWalletContext = createContext<HubWalletContextValue | null>(null)

/** graz setup for one deployment. Exported for tests. */
export function grazOptions(deployment: Deployment, projectId: string | undefined, origin: string): ConfigureGrazArgs {
  const chain = hubChainInfo(deployment)
  return {
    chains: [chain],
    chainsConfig: { [chain.chainId]: { gas: { price: String(GAS_PRICE_STEP.average), denom: deployment.hub.gasDenom } } },
    defaultWallet: WalletType.KEPLR,
    // reconnect on reload to whichever wallet was last used
    autoReconnect: true,
    // sign exactly the simulated fee (it already has headroom), and don't ask for a memo
    walletDefaultOptions: { sign: { preferNoSetFee: true, preferNoSetMemo: true } },
    walletConnect: projectId
      ? {
          options: {
            projectId,
            metadata: { name: 'Bad Bridge', description: 'Bring your Bad Kids to Ethereum', url: origin, icons: [] },
            // no WalletConnect analytics
            telemetryEnabled: false,
          },
        }
      : undefined,
    // our own keys, so another graz app on the same origin can't clash
    prefixStorageKey: 'bad-bridge',
  }
}

/**
 * Hub wallet providers: GrazProvider (Keplr, Cosmostation, WalletConnect) plus the Leap connector. Needs a
 * QueryClientProvider above it. Note GrazProvider renders nothing on its very first pass (it mounts children
 * after configuring), so anything below it appears one tick later.
 */
export function HubWalletProvider({ deployment, children }: { deployment: Deployment; children: ReactNode }) {
  const options = useMemo(
    () => grazOptions(deployment, wcProjectId, typeof location === 'undefined' ? '' : location.origin),
    [deployment],
  )
  const chainId = deployment.hub.chainId
  const context = useMemo<HubWalletContextValue>(() => ({ leap: createLeapConnector(chainId) }), [chainId])
  useEffect(() => context.leap.start(), [context])

  return (
    <GrazProvider grazOptions={options}>
      <HubWalletContext.Provider value={context}>{children}</HubWalletContext.Provider>
    </GrazProvider>
  )
}
