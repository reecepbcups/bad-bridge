import { describe, expect, it, vi } from 'vitest'
import type { CreateConnectorFn } from 'wagmi'
import { DEPLOYMENTS } from '../../config/deployments'
import { createWagmiConfig, wagmiConfigFor } from './config'

// The real WalletConnect connector opens a relay socket as soon as it's set up. Swap in an inert stand-in that
// records its parameters, so the test can see it's only built with a project id.
const wcCalls = vi.hoisted(() => [] as unknown[])
vi.mock('wagmi/connectors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi/connectors')>()
  return {
    ...actual,
    walletConnect: (params: unknown): CreateConnectorFn => {
      wcCalls.push(params)
      return (config) => ({ ...actual.injected()(config), id: 'walletConnect', name: 'WalletConnect', type: 'walletConnect' })
    },
  }
})

const deployment = DEPLOYMENTS['reece-test']

describe('createWagmiConfig', () => {
  it('is mainnet only, with injected and Coinbase but no WalletConnect without a project id', () => {
    wcCalls.length = 0
    const config = createWagmiConfig(deployment, { wcProjectId: undefined })
    expect(config.chains.map((c) => c.id)).toEqual([1])
    expect(config.connectors.map((c) => c.id)).toEqual(['injected', 'coinbaseWalletSDK'])
    expect(wcCalls).toEqual([])
  })

  it('adds WalletConnect when there is a project id', () => {
    wcCalls.length = 0
    const config = createWagmiConfig(deployment, { wcProjectId: 'abc123' })
    expect(config.connectors.map((c) => c.id)).toEqual(['injected', 'coinbaseWalletSDK', 'walletConnect'])
    expect(wcCalls).toEqual([expect.objectContaining({ projectId: 'abc123', showQrModal: true })])
  })

  it('refuses anything but mainnet', () => {
    expect(() => createWagmiConfig({ ...deployment, eth: { ...deployment.eth, chainId: 11155111 } })).toThrow(/mainnet only/)
  })

  it('builds one config per deployment', () => {
    expect(wagmiConfigFor(deployment)).toBe(wagmiConfigFor(deployment))
  })
})
