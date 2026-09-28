import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isBridgeError } from '../types'
import { REECE, testDeployment } from './fixtures'
import { createLeapConnector } from './leap'
import { HubWalletContext, grazOptions, type HubWalletContextValue } from './provider'
import { hubWalletOptions, useHubWallet, useHubWriter } from './wallet'

// graz is mocked: these tests are about how its state maps onto WalletState, not about graz itself.
const graz = vi.hoisted(() => ({
  account: { data: undefined as Record<string, unknown> | undefined, isConnected: false, isConnecting: false, isReconnecting: false, walletType: undefined as string | undefined },
  connect: vi.fn<(args: unknown) => Promise<unknown>>(() => Promise.resolve({})),
  disconnect: vi.fn(() => Promise.resolve()),
  getOfflineSigners: vi.fn(),
}))

vi.mock('graz', () => ({
  WalletType: { KEPLR: 'keplr', COSMOSTATION: 'cosmostation', WALLETCONNECT: 'walletconnect' },
  GrazProvider: ({ children }: { children: ReactNode }) => children,
  useAccount: () => graz.account,
  connect: graz.connect,
  disconnect: graz.disconnect,
  getOfflineSigners: graz.getOfflineSigners,
}))

const deployment = testDeployment()
const PUBKEY = new Uint8Array(33).fill(2)
const LEAP_ADDR = 'cosmos1d8mq46wt2yxsgwrmh6hhfgycl0537w8gtm8xqw'

type Win = { keplr?: unknown; leap?: unknown; cosmostation?: unknown }

function setup() {
  const ctx: HubWalletContextValue = { leap: createLeapConnector('cosmoshub-4') }
  const wrapper = ({ children }: { children: ReactNode }) => <HubWalletContext.Provider value={ctx}>{children}</HubWalletContext.Provider>
  return { ctx, wrapper }
}

beforeEach(() => {
  graz.account = { data: undefined, isConnected: false, isConnecting: false, isReconnecting: false, walletType: undefined }
  graz.connect.mockReset().mockResolvedValue({})
  graz.disconnect.mockClear()
  ;(window as Win).keplr = {}
  ;(window as Win).leap = {
    defaultOptions: {},
    enable: vi.fn(() => Promise.resolve()),
    getKey: vi.fn(() => Promise.resolve({ bech32Address: LEAP_ADDR, pubKey: PUBKEY })),
    getOfflineSignerAuto: vi.fn(),
  }
})

afterEach(() => {
  delete (window as Win).keplr
  delete (window as Win).leap
  localStorage.clear()
})

describe('wallet options', () => {
  it('offers Keplr, Leap, Cosmostation, installed first; WalletConnect only with a project id', () => {
    expect(hubWalletOptions({ keplr: false, leap: true, cosmostation: false, walletConnect: false })).toEqual([
      { id: 'leap', name: 'Leap', installed: true },
      { id: 'keplr', name: 'Keplr', installed: false },
      { id: 'cosmostation', name: 'Cosmostation', installed: false },
    ])
    expect(hubWalletOptions({ keplr: true, leap: false, cosmostation: true, walletConnect: true }).map((o) => o.id)).toEqual([
      'keplr',
      'cosmostation',
      'walletconnect',
      'leap',
    ])
  })

  it('detects injected extensions', () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useHubWallet(deployment), { wrapper })
    expect(result.current.status).toBe('disconnected')
    expect(result.current.address).toBeUndefined()
    expect(result.current.options.filter((o) => o.installed).map((o) => o.id)).toEqual(['keplr', 'leap'])
  })
})

describe('graz wallets', () => {
  it('maps a graz connection to WalletState and a writer', () => {
    graz.account = {
      data: { 'cosmoshub-4': { bech32Address: REECE, pubKey: PUBKEY } },
      isConnected: true,
      isConnecting: false,
      isReconnecting: false,
      walletType: 'keplr',
    }
    const { wrapper } = setup()
    const { result } = renderHook(() => ({ wallet: useHubWallet(deployment), writer: useHubWriter(deployment) }), { wrapper })
    expect(result.current.wallet).toMatchObject({ status: 'connected', address: REECE, walletName: 'Keplr' })
    expect(result.current.writer?.address).toBe(REECE)
  })

  it('reconnecting reads as connecting, with no writer', () => {
    graz.account = { ...graz.account, isReconnecting: true }
    const { wrapper } = setup()
    const { result } = renderHook(() => ({ wallet: useHubWallet(deployment), writer: useHubWriter(deployment) }), { wrapper })
    expect(result.current.wallet.status).toBe('connecting')
    expect(result.current.writer).toBeNull()
  })

  it('connect("keplr") asks graz for cosmoshub-4 with auto-reconnect', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useHubWallet(deployment), { wrapper })
    await act(() => result.current.connect('keplr'))
    expect(graz.connect).toHaveBeenCalledWith({ chainId: ['cosmoshub-4'], walletType: 'keplr', autoReconnect: true })
  })

  it('a declined connection is UserRejected', async () => {
    graz.connect.mockRejectedValueOnce(new Error('Request rejected'))
    const { wrapper } = setup()
    const { result } = renderHook(() => useHubWallet(deployment), { wrapper })
    const err = await act(() => result.current.connect('keplr').catch((e: unknown) => e))
    expect(isBridgeError(err) && err.code).toBe('UserRejected')
  })

  it("won't connect a wallet that isn't installed, or WalletConnect without a project id", async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useHubWallet(deployment), { wrapper })
    for (const id of ['cosmostation', 'walletconnect', 'nope']) {
      const err = await act(() => result.current.connect(id).catch((e: unknown) => e))
      expect(isBridgeError(err) && err.code).toBe('Unknown')
    }
    expect(graz.connect).not.toHaveBeenCalled()
  })
})

describe('Leap (outside graz)', () => {
  it('connects through window.leap, remembers it, and disconnects graz first', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => ({ wallet: useHubWallet(deployment), writer: useHubWriter(deployment) }), { wrapper })
    await act(() => result.current.wallet.connect('leap'))
    expect(graz.disconnect).toHaveBeenCalled()
    expect(result.current.wallet).toMatchObject({ status: 'connected', address: LEAP_ADDR, walletName: 'Leap' })
    expect(result.current.writer?.address).toBe(LEAP_ADDR)
    expect(localStorage.getItem('bad-bridge:hub-wallet')).toBe('leap')
    expect((window as { leap?: { defaultOptions?: unknown } }).leap?.defaultOptions).toEqual({ sign: { preferNoSetFee: true, preferNoSetMemo: true } })

    await act(() => result.current.wallet.disconnect())
    expect(result.current.wallet.status).toBe('disconnected')
    expect(localStorage.getItem('bad-bridge:hub-wallet')).toBeNull()
  })

  it('reconnects on load when Leap was the last wallet', async () => {
    localStorage.setItem('bad-bridge:hub-wallet', 'leap')
    const { ctx, wrapper } = setup()
    const { result } = renderHook(() => useHubWallet(deployment), { wrapper })
    let stop = () => undefined as void
    act(() => {
      stop = ctx.leap.start()
    })
    await waitFor(() => expect(result.current.status).toBe('connected'))
    expect(result.current.address).toBe(LEAP_ADDR)
    stop()
  })

  it('a declined Leap prompt is UserRejected and leaves it disconnected', async () => {
    ;(window as { leap?: { enable: () => Promise<void> } }).leap!.enable = () => Promise.reject(new Error('Request rejected'))
    const { wrapper } = setup()
    const { result } = renderHook(() => useHubWallet(deployment), { wrapper })
    const err = await act(() => result.current.connect('leap').catch((e: unknown) => e))
    expect(isBridgeError(err) && err.code).toBe('UserRejected')
    expect(result.current.status).toBe('disconnected')
  })
})

describe('graz options', () => {
  it('gives graz a complete cosmoshub-4 ChainInfo and our own storage prefix', () => {
    const opts = grazOptions(deployment, undefined, 'https://bridge.test')
    const chain = opts.chains[0]
    expect(chain).toMatchObject({
      chainId: 'cosmoshub-4',
      rpc: deployment.hub.rpc[0],
      rest: deployment.hub.rest[0],
      bip44: { coinType: 118 },
      bech32Config: { bech32PrefixAccAddr: 'cosmos', bech32PrefixValAddr: 'cosmosvaloper' },
      currencies: [{ coinDenom: 'ATOM', coinMinimalDenom: 'uatom', coinDecimals: 6 }],
      feeCurrencies: [{ coinMinimalDenom: 'uatom', gasPriceStep: { low: 0.005, average: 0.0075, high: 0.01 } }],
    })
    expect(opts.autoReconnect).toBe(true)
    expect(opts.walletConnect).toBeUndefined()
    expect(opts.prefixStorageKey).toBe('bad-bridge')
    expect(grazOptions(deployment, 'abc', 'https://bridge.test').walletConnect?.options?.projectId).toBe('abc')
  })
})
