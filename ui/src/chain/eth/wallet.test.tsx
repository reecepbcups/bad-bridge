import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { http, UserRejectedRequestError } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { createConfig, WagmiProvider, type Config } from 'wagmi'
import { switchChain } from 'wagmi/actions'
import { mock } from 'wagmi/connectors'
import { DEPLOYMENTS } from '../../config/deployments'
import { BridgeError } from '../types'
import { ethWalletOptions, useEthWallet, useEthWriter } from './wallet'

const deployment = DEPLOYMENTS['reece-test']
const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const

describe('ethWalletOptions', () => {
  const coinbase = { id: 'coinbaseWalletSDK', name: 'Coinbase Wallet', type: 'coinbaseWallet' }
  const wc = { id: 'walletConnect', name: 'WalletConnect', type: 'walletConnect' }
  const plain = { id: 'injected', name: 'Injected', type: 'injected' }
  const metamask = { id: 'io.metamask', name: 'MetaMask', type: 'injected', icon: 'data:image/svg+xml,mm' }
  const rabby = { id: 'io.rabby', name: 'Rabby Wallet', type: 'injected', icon: 'data:image/svg+xml,rb' }

  it('offers announced wallets first, then Coinbase and WalletConnect, hiding the plain injected one', () => {
    expect(ethWalletOptions([plain, coinbase, wc, metamask, rabby], true)).toEqual([
      { id: 'io.metamask', name: 'MetaMask', installed: true, icon: 'data:image/svg+xml,mm' },
      { id: 'io.rabby', name: 'Rabby Wallet', installed: true, icon: 'data:image/svg+xml,rb' },
      { id: 'coinbaseWalletSDK', name: 'Coinbase Wallet', installed: true, icon: undefined },
      { id: 'walletConnect', name: 'WalletConnect', installed: true, icon: undefined },
    ])
  })

  it('falls back to window.ethereum when nothing announces itself', () => {
    expect(ethWalletOptions([plain, coinbase], true).map((o) => o.id)).toEqual(['injected', 'coinbaseWalletSDK'])
    expect(ethWalletOptions([plain, coinbase], false).map((o) => o.id)).toEqual(['coinbaseWalletSDK'])
  })

  it('leaves WalletConnect out when the config has none (no project id)', () => {
    expect(ethWalletOptions([plain, coinbase, metamask], true).map((o) => o.id)).toEqual(['io.metamask', 'coinbaseWalletSDK'])
  })
})

function setup(features?: Parameters<typeof mock>[0]['features']) {
  // the mock wallet starts on Sepolia; switching to mainnet is a separate step after connect
  const config: Config = createConfig({
    chains: [sepolia, mainnet],
    connectors: [mock({ accounts: [ACCOUNT], features })],
    transports: { [sepolia.id]: http(), [mainnet.id]: http() },
    multiInjectedProviderDiscovery: false,
    storage: null,
  })
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
  const hook = renderHook(() => ({ wallet: useEthWallet(deployment), writer: useEthWriter(deployment) }), { wrapper })
  return { config, hook }
}

describe('useEthWallet / useEthWriter', () => {
  it('connects on mainnet, exposes the account and a writer, and disconnects', async () => {
    const { hook } = setup()
    expect(hook.result.current.wallet).toMatchObject({ status: 'disconnected', address: undefined, wrongChain: false })
    expect(hook.result.current.writer).toBeNull()

    await act(() => hook.result.current.wallet.connect('mock'))
    await waitFor(() => expect(hook.result.current.wallet.status).toBe('connected'))
    // connect() no longer passes chainId, so the mock wallet stays on Sepolia until switchChain runs separately
    expect(hook.result.current.wallet).toMatchObject({ address: ACCOUNT, walletName: 'Mock Connector', wrongChain: true })
    expect(hook.result.current.writer?.address).toBe(ACCOUNT)

    await act(() => hook.result.current.wallet.switchChain!())
    await waitFor(() => expect(hook.result.current.wallet.wrongChain).toBe(false))

    await act(() => hook.result.current.wallet.disconnect())
    await waitFor(() => expect(hook.result.current.wallet.status).toBe('disconnected'))
    expect(hook.result.current.writer).toBeNull()
  })

  it('flags the wrong chain, refuses to claim on it, and switches back', async () => {
    const { config, hook } = setup()
    await act(() => hook.result.current.wallet.connect('mock'))
    await act(async () => {
      await switchChain(config, { chainId: sepolia.id })
    })
    await waitFor(() => expect(hook.result.current.wallet.wrongChain).toBe(true))

    const err = await hook.result.current.writer!.claim([1]).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BridgeError)
    expect(err).toMatchObject({ code: 'WrongChain' })

    await act(() => hook.result.current.wallet.switchChain!())
    await waitFor(() => expect(hook.result.current.wallet.wrongChain).toBe(false))
  })

  it('rejects connect with a BridgeError', async () => {
    const { hook } = setup({ connectError: true })
    await expect(hook.result.current.wallet.connect('mock')).rejects.toMatchObject({ code: 'UserRejected' })
    await expect(hook.result.current.wallet.connect('nope')).rejects.toMatchObject({ code: 'Unknown' })
    await waitFor(() => expect(hook.result.current.wallet.status).toBe('disconnected'))
  })

  it('rejects a declined chain switch with UserRejected', async () => {
    const { config, hook } = setup()
    await act(() => hook.result.current.wallet.connect('mock'))
    await act(async () => {
      await switchChain(config, { chainId: sepolia.id })
    })
    // same connector, now refusing switches
    const connector = config.connectors[0]!
    const original = connector.switchChain!.bind(connector)
    connector.switchChain = () => Promise.reject(new UserRejectedRequestError(new Error('User rejected the request.')))
    await expect(hook.result.current.wallet.switchChain!()).rejects.toMatchObject({ code: 'UserRejected' })
    connector.switchChain = original
  })
})
