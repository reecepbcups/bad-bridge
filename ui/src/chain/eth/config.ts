import { createConfig, ProviderNotFoundError, type Config, type CreateConnectorFn } from 'wagmi'
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'
import { mainnet } from 'wagmi/chains'
import { wcProjectId, type Deployment } from '../../config/deployments'
import { ethChain, ethTransport } from './client'

/** Connector ids useEthWallet offers besides the EIP-6963 wallets (whose id is their rdns, e.g. io.metamask). */
export const CONNECTOR_IDS = {
  /** Plain window.ethereum, for wallets and in-app browsers that don't announce via EIP-6963. */
  injected: 'injected',
  coinbase: 'coinbaseWalletSDK',
  walletConnect: 'walletConnect',
} as const

const APP_NAME = 'Bad Bridge'

export interface WagmiConfigOptions {
  /** Reown project id. Defaults to VITE_WC_PROJECT_ID; without one, WalletConnect isn't offered (it 403s). */
  wcProjectId?: string | undefined
}

/**
 * Holds a connector's SDK back until it's wanted. wagmi asks every connector for its provider at startup (setup()
 * and the reconnect on mount): for Coinbase that downloads and starts its SDK, for WalletConnect it opens a relay
 * socket, on every visit, for every visitor. Wrapped, the provider only loads once the user picks that wallet, or
 * on a reload when it's the wallet they used last (so reconnecting still works).
 */
export function onDemand(connectorFn: CreateConnectorFn): CreateConnectorFn {
  return (config) => {
    const connector = connectorFn(config)
    let wanted = false
    const isWanted = async () => {
      if (!wanted) {
        try {
          wanted = (await config.storage?.getItem('recentConnectorId')) === connector.id
        } catch {
          // no storage: it just waits for a click
        }
      }
      return wanted
    }
    const { connect, getProvider, setup } = connector
    // plain functions, not arrows: wagmi calls them as methods of its own copy, and the originals use `this`
    if (setup) {
      connector.setup = async function (this: unknown) {
        // connect() does its own wiring, so a setup skipped now isn't needed later
        if (await isWanted()) await setup.apply(this)
      }
    }
    return Object.assign(connector, {
      connect: function (this: unknown, ...args: Parameters<typeof connect>) {
        wanted = true
        return connect.apply(this, args)
      } as typeof connect,
      getProvider: async function (this: unknown, ...args: Parameters<typeof getProvider>) {
        if (!(await isWanted())) throw new ProviderNotFoundError()
        return getProvider.apply(this, args)
      },
    })
  }
}

/**
 * wagmi config: mainnet over the deployment's RPCs, EIP-6963 discovery plus a plain injected fallback,
 * Coinbase Wallet, and WalletConnect only when there's a project id. Coinbase and WalletConnect load on demand.
 */
export function createWagmiConfig(deployment: Deployment, options: WagmiConfigOptions = {}): Config {
  // throws for anything but mainnet, same as the reader and writer
  ethChain(deployment)
  const projectId = 'wcProjectId' in options ? options.wcProjectId : wcProjectId
  const origin = typeof location === 'undefined' ? 'https://github.com/reecepbcups/bad-bridge' : location.origin

  const connectors: CreateConnectorFn[] = [
    injected({ shimDisconnect: true }),
    // telemetry off: otherwise the SDK posts analytics to Coinbase as soon as it loads
    onDemand(coinbaseWallet({ appName: APP_NAME, preference: { options: 'all', telemetry: false } })),
  ]
  if (projectId) {
    connectors.push(
      onDemand(
        walletConnect({
          projectId,
          showQrModal: true,
          // no WalletConnect analytics
          telemetryEnabled: false,
          metadata: { name: APP_NAME, description: `Move ${deployment.collectionName} from the Cosmos Hub to Ethereum`, url: origin, icons: [] },
        }),
      ),
    )
  }

  return createConfig({
    chains: [mainnet],
    connectors,
    multiInjectedProviderDiscovery: true,
    transports: { [mainnet.id]: ethTransport(deployment) },
  })
}

const configs = new WeakMap<Deployment, Config>()

/** One config per deployment for the page's lifetime, so StrictMode and remounts don't re-run discovery. */
export function wagmiConfigFor(deployment: Deployment): Config {
  let config = configs.get(deployment)
  if (!config) {
    config = createWagmiConfig(deployment)
    configs.set(deployment, config)
  }
  return config
}
