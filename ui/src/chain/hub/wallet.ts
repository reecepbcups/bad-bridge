// React side of the Hub wallet: graz for Keplr, Cosmostation and WalletConnect, our own connector for Leap,
// merged into the adapter-agnostic WalletState and a HubWriter.

import { connect as grazConnect, disconnect as grazDisconnect, getOfflineSigners, useAccount, WalletType } from 'graz'
import { useCallback, useContext, useMemo, useState, useSyncExternalStore } from 'react'
import { wcProjectId, type Deployment } from '../../config/deployments'
import { BridgeError, type HubAddress, type HubWriter, type WalletOption, type WalletState, type WalletStatus } from '../types'
import { walletErrorToBridgeError } from './errors'
import { HubWalletContext, type HubWalletContextValue } from './provider'
import { createHubWriter } from './writer'

/** Option ids (the same ones the demo adapter uses) → graz wallet types. Leap is handled outside graz. */
const GRAZ_WALLETS: Readonly<Record<string, { type: WalletType; name: string }>> = {
  keplr: { type: WalletType.KEPLR, name: 'Keplr' },
  cosmostation: { type: WalletType.COSMOSTATION, name: 'Cosmostation' },
  walletconnect: { type: WalletType.WALLETCONNECT, name: 'WalletConnect' },
}

function walletName(type: WalletType | undefined): string | undefined {
  if (!type) return undefined
  return Object.values(GRAZ_WALLETS).find((w) => w.type === type)?.name ?? type
}

/** What the connect sheet offers: Keplr, Leap, Cosmostation, plus WalletConnect with a project id. Installed first. */
export function hubWalletOptions(found: { keplr: boolean; leap: boolean; cosmostation: boolean; walletConnect: boolean }): WalletOption[] {
  const all: WalletOption[] = [
    { id: 'keplr', name: 'Keplr', installed: found.keplr },
    { id: 'leap', name: 'Leap', installed: found.leap },
    { id: 'cosmostation', name: 'Cosmostation', installed: found.cosmostation },
  ]
  if (found.walletConnect) all.push({ id: 'walletconnect', name: 'WalletConnect', installed: true })
  return [...all.filter((o) => o.installed), ...all.filter((o) => !o.installed)]
}

function detectWallets(ctx: HubWalletContextValue): WalletOption[] {
  const w = (typeof window === 'undefined' ? {} : window) as {
    keplr?: unknown
    cosmostation?: { providers?: { keplr?: unknown } }
  }
  return hubWalletOptions({
    keplr: w.keplr !== undefined,
    leap: ctx.leap.installed(),
    cosmostation: w.cosmostation?.providers?.keplr !== undefined,
    walletConnect: wcProjectId !== undefined,
  })
}

function useHubContext(): HubWalletContextValue {
  const ctx = useContext(HubWalletContext)
  if (!ctx) throw new Error('Hub wallet hooks need a HubWalletProvider above them')
  return ctx
}

interface Connection {
  /** Which side holds the connection. */
  via: 'leap' | 'graz' | null
  status: WalletStatus
  address?: HubAddress
  pubkey?: Uint8Array
  grazType?: WalletType
  walletName?: string
}

/** The one live connection, from Leap or graz (connect() makes sure only one is ever up). */
function useConnection(deployment: Deployment, ctx: HubWalletContextValue): Connection {
  const chainId = deployment.hub.chainId
  const leap = useSyncExternalStore(ctx.leap.subscribe, ctx.leap.getSnapshot)
  const accountArgs = useMemo(() => ({ chainId: [chainId] }), [chainId])
  const account = useAccount(accountArgs)
  const key = account.data?.[chainId]

  if (leap.status !== 'disconnected') {
    return { via: 'leap', status: leap.status, address: leap.address, pubkey: leap.pubkey, walletName: 'Leap' }
  }
  if (account.isConnected && key) {
    return {
      via: 'graz',
      status: 'connected',
      address: key.bech32Address,
      pubkey: key.pubKey,
      grazType: account.walletType,
      walletName: walletName(account.walletType),
    }
  }
  // graz says connected before the key for our chain is in: still connecting
  const busy = account.isConnecting || account.isReconnecting || account.isConnected
  return { via: busy ? 'graz' : null, status: busy ? 'connecting' : 'disconnected' }
}

/** graz-backed Hub wallet (Keplr, Leap, Cosmostation, WalletConnect). Call under HubWalletProvider. */
export function useHubWallet(deployment: Deployment): WalletState<HubAddress> {
  const ctx = useHubContext()
  const chainId = deployment.hub.chainId
  const conn = useConnection(deployment, ctx)
  // extensions inject before the app loads, so once per mount is enough
  const [options] = useState(() => detectWallets(ctx))
  // the wallet being connected, for "Check Keplr…" copy before graz knows it
  const [pending, setPending] = useState<string | undefined>()

  const connect = useCallback(
    async (id: string) => {
      if (id === 'leap') {
        await grazDisconnect()
        await ctx.leap.connect()
        return
      }
      const wallet = GRAZ_WALLETS[id]
      if (!wallet || (wallet.type === WalletType.WALLETCONNECT && !wcProjectId)) {
        throw new BridgeError('Unknown', `no Hub wallet called "${id}"`)
      }
      const option = options.find((o) => o.id === id)
      if (option && !option.installed) throw new BridgeError('Unknown', `${wallet.name} isn't installed in this browser`)
      ctx.leap.disconnect()
      setPending(wallet.name)
      try {
        await grazConnect({ chainId: [chainId], walletType: wallet.type, autoReconnect: true })
      } catch (e) {
        throw walletErrorToBridgeError(e)
      } finally {
        setPending(undefined)
      }
    },
    [ctx, chainId, options],
  )

  const disconnect = useCallback(async () => {
    ctx.leap.disconnect()
    try {
      await grazDisconnect()
    } catch {
      // never rejects
    }
  }, [ctx])

  const { status, address } = conn
  const name = conn.walletName ?? (status === 'connecting' ? pending : undefined)
  return useMemo<WalletState<HubAddress>>(() => {
    const state: WalletState<HubAddress> = { status, options, connect, disconnect }
    if (status === 'connected' && address) state.address = address
    if (status !== 'disconnected' && name) state.walletName = name
    return state
  }, [status, address, name, options, connect, disconnect])
}

/** Signer for the connected Hub wallet, or null while disconnected. Call under HubWalletProvider. */
export function useHubWriter(deployment: Deployment): HubWriter | null {
  const ctx = useHubContext()
  const { via, status, address, pubkey, grazType } = useConnection(deployment, ctx)
  const chainId = deployment.hub.chainId

  return useMemo(() => {
    if (status !== 'connected' || !address) return null
    const signer =
      via === 'leap'
        ? () => ctx.leap.signer()
        : async () => (await getOfflineSigners({ chainId, walletType: grazType })).offlineSignerAuto
    return createHubWriter({ deployment, address, pubkey, signer })
  }, [deployment, ctx, chainId, via, status, address, pubkey, grazType])
}
