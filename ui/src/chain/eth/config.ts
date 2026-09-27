import { createConfig, type Config, type CreateConnectorFn } from 'wagmi'
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
 * wagmi config: mainnet over the deployment's RPCs, EIP-6963 discovery plus a plain injected fallback,
 * Coinbase Wallet, and WalletConnect only when there's a project id.
 */
export function createWagmiConfig(deployment: Deployment, options: WagmiConfigOptions = {}): Config {
  // throws for anything but mainnet, same as the reader and writer
  ethChain(deployment)
  const projectId = 'wcProjectId' in options ? options.wcProjectId : wcProjectId
  const origin = typeof location === 'undefined' ? 'https://github.com/reecepbcups/bad-bridge' : location.origin

  const connectors: CreateConnectorFn[] = [
    injected({ shimDisconnect: true }),
    coinbaseWallet({ appName: APP_NAME }),
  ]
  if (projectId) {
    connectors.push(
      walletConnect({
        projectId,
        showQrModal: true,
        metadata: { name: APP_NAME, description: `Move ${deployment.collectionName} from the Cosmos Hub to Ethereum`, url: origin, icons: [] },
      }),
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
