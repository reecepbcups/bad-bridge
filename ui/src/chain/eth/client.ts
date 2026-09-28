import { createPublicClient, fallback, http, type Chain, type PublicClient, type Transport } from 'viem'
import { mainnet } from 'viem/chains'
import type { Deployment } from '../../config/deployments'

// viem-only plumbing shared by the reader, the writer core and the wagmi config.

/** Per-endpoint timeout. publicnode answers in well under a second; a hung endpoint shouldn't hold the UI. */
const RPC_TIMEOUT_MS = 15_000

/** The viem chain for a deployment. Mainnet only: anything else is a config mistake. */
export function ethChain(deployment: Deployment): Chain {
  if (deployment.eth.chainId !== mainnet.id) {
    throw new Error(`eth.chainId ${deployment.eth.chainId} isn't supported: Bad Bridge is Ethereum mainnet only`)
  }
  return mainnet
}

/** fallback() over the deployment's RPCs, tried in order. */
export function ethTransport(deployment: Deployment): Transport {
  const rpcs = deployment.eth.rpc
  if (rpcs.length === 0) throw new Error(`deployment ${deployment.id} has no Ethereum RPCs`)
  return fallback(
    rpcs.map((url) => http(url, { timeout: RPC_TIMEOUT_MS, retryCount: 1 })),
    { retryCount: 1 },
  )
}

/** Public client for reads, simulation, gas estimates and receipts. */
export function createEthPublicClient(deployment: Deployment): PublicClient {
  return createPublicClient({ chain: ethChain(deployment), transport: ethTransport(deployment) })
}
