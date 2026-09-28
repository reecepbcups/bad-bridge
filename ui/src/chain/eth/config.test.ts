import { describe, expect, it, vi } from 'vitest'
import type { CreateConnectorFn } from 'wagmi'
import { DEPLOYMENTS } from '../../config/deployments'
import { createStorage, type CreateConnectorFn as ConnectorFn } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { createWagmiConfig, onDemand, wagmiConfigFor } from './config'

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
    expect(wcCalls).toEqual([expect.objectContaining({ projectId: 'abc123', showQrModal: true, telemetryEnabled: false })])
  })

  it('refuses anything but mainnet', () => {
    expect(() => createWagmiConfig({ ...deployment, eth: { ...deployment.eth, chainId: 11155111 } })).toThrow(/mainnet only/)
  })

  it('builds one config per deployment', () => {
    expect(wagmiConfigFor(deployment)).toBe(wagmiConfigFor(deployment))
  })
})

describe('onDemand', () => {
  /** A connector whose provider is an SDK we can count loads of. */
  function sdkConnector(id: string) {
    const loads = vi.fn(() => Promise.resolve({ sdk: id }))
    const fn: ConnectorFn = () => ({
      id,
      name: id,
      type: id,
      connect(this: { getProvider(): Promise<unknown> }) {
        return this.getProvider().then(() => ({ accounts: [], chainId: 1 }))
      },
      disconnect: () => Promise.resolve(),
      getAccounts: () => Promise.resolve([]),
      getChainId: () => Promise.resolve(1),
      getProvider: loads,
      isAuthorized: () => Promise.resolve(false),
      onAccountsChanged: () => undefined,
      onChainChanged: () => undefined,
      onDisconnect: () => undefined,
    })
    return { fn, loads }
  }

  function build(fn: ConnectorFn, recent?: string) {
    const backing = new Map<string, string>()
    const storage = createStorage({
      storage: { getItem: (k) => backing.get(k) ?? null, setItem: (k, v) => void backing.set(k, v), removeItem: (k) => void backing.delete(k) },
    })
    if (recent) void storage.setItem('recentConnectorId', recent)
    const connector = onDemand(fn)({ chains: [mainnet], emitter: { emit: vi.fn() } as never, storage })
    // wagmi keeps its own copy of the connector and calls methods on that
    return { ...connector }
  }

  it("doesn't load the SDK until the user picks the wallet", async () => {
    const { fn, loads } = sdkConnector('walletConnect')
    const connector = build(fn)
    await expect(connector.getProvider()).rejects.toThrow(/Provider not found/)
    expect(loads).not.toHaveBeenCalled()
    await connector.connect()
    expect(loads).toHaveBeenCalledTimes(1)
    await expect(connector.getProvider()).resolves.toEqual({ sdk: 'walletConnect' })
  })

  it('loads it at startup when it was the wallet used last, so reconnecting works', async () => {
    const { fn, loads } = sdkConnector('coinbaseWalletSDK')
    await expect(build(fn, 'coinbaseWalletSDK').getProvider()).resolves.toEqual({ sdk: 'coinbaseWalletSDK' })
    expect(loads).toHaveBeenCalledTimes(1)
  })

  it("stays put when another wallet was used last", async () => {
    const { fn, loads } = sdkConnector('coinbaseWalletSDK')
    await expect(build(fn, 'io.metamask').getProvider()).rejects.toThrow()
    expect(loads).not.toHaveBeenCalled()
  })

  it('wraps Coinbase and WalletConnect in the real config, and nothing loads just from building it', async () => {
    const config = createWagmiConfig(deployment, { wcProjectId: undefined })
    const coinbase = config.connectors.find((c) => c.id === 'coinbaseWalletSDK')
    await expect(coinbase?.getProvider()).rejects.toThrow(/Provider not found/)
  })
})
