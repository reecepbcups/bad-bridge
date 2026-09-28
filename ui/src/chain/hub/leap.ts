// Leap, which graz 0.7.0 no longer supports. Leap injects a Keplr-compatible `window.leap`, so this is a small
// external store over it: connect, remember the choice for reload, follow account switches.

import type { OfflineSigner } from '@cosmjs/proto-signing'
import type { Keplr } from '@keplr-wallet/types'
import { BridgeError, type HubAddress, type WalletStatus } from '../types'
import { walletErrorToBridgeError } from './errors'

type LeapLike = Pick<Keplr, 'enable' | 'getKey' | 'getOfflineSignerAuto'> & { defaultOptions?: Keplr['defaultOptions'] }

export interface LeapSnapshot {
  status: WalletStatus
  address?: HubAddress
  /** The account's secp256k1 pubkey, for simulating before the first tx. */
  pubkey?: Uint8Array
}

// function-valued properties, not methods: they're passed around unbound (useSyncExternalStore)
export interface LeapConnector {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => LeapSnapshot
  installed: () => boolean
  /** Enables the chain in Leap and reads the account. Rejects with a BridgeError. */
  connect: () => Promise<void>
  disconnect: () => void
  /** The signer for the connected account. */
  signer: () => Promise<OfflineSigner>
  /** Reconnects if Leap was the last wallet used, and follows account switches. Returns a cleanup. */
  start: () => () => void
}

const STORAGE_KEY = 'bad-bridge:hub-wallet'
const DISCONNECTED: LeapSnapshot = { status: 'disconnected' }

function leapWindow(): LeapLike | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { leap?: LeapLike }).leap
}

function remembered(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'leap'
  } catch {
    return false
  }
}

function remember(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, 'leap')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage blocked: Leap just won't reconnect on reload
  }
}

export function createLeapConnector(chainId: string): LeapConnector {
  let snapshot: LeapSnapshot = DISCONNECTED
  const listeners = new Set<() => void>()
  const set = (next: LeapSnapshot) => {
    snapshot = next
    for (const l of listeners) l()
  }

  function leap(): LeapLike {
    const w = leapWindow()
    if (!w) throw new BridgeError('Unknown', "Leap isn't installed in this browser")
    return w
  }

  async function readKey(): Promise<void> {
    const key = await leap().getKey(chainId)
    set({ status: 'connected', address: key.bech32Address, pubkey: key.pubKey })
  }

  async function connect(): Promise<void> {
    set({ status: 'connecting' })
    try {
      const w = leap()
      // sign exactly the simulated fee, no memo prompt
      w.defaultOptions = { sign: { preferNoSetFee: true, preferNoSetMemo: true } }
      await w.enable(chainId)
      await readKey()
      remember(true)
    } catch (e) {
      set(DISCONNECTED)
      throw walletErrorToBridgeError(e)
    }
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    installed: () => leapWindow() !== undefined,
    connect,
    disconnect: () => {
      remember(false)
      set(DISCONNECTED)
    },
    signer: async () => (await leap().getOfflineSignerAuto(chainId)) as unknown as OfflineSigner,
    start: () => {
      const onKeystoreChange = () => {
        if (snapshot.status === 'connected') readKey().catch(() => set(DISCONNECTED))
      }
      window.addEventListener('leap_keystorechange', onKeystoreChange)
      // enable() on a site Leap already approved doesn't prompt
      if (remembered() && leapWindow() && snapshot.status === 'disconnected') {
        connect().catch(() => remember(false))
      }
      return () => window.removeEventListener('leap_keystorechange', onKeystoreChange)
    },
  }
}
