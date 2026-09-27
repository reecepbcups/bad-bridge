import { bytesToHex } from 'viem'
import type { Deployment } from '../../config/deployments'
import { decodeBech32 } from '../bech32'
import {
  BridgeError,
  stageReporter,
  toBridgeError,
  type EthAddress,
  type EthReader,
  type EthWriter,
  type HubAddress,
  type HubReader,
  type HubWriter,
  type WalletOption,
  type WalletState,
} from '../types'
import type { DemoChain, DemoSim, DemoWallet } from './sim'

// Wraps the synchronous sim in the async adapter interfaces, with its latency, signing delays and failures.

const HUB_OPTIONS: WalletOption[] = [
  { id: 'keplr', name: 'Keplr', installed: true },
  { id: 'leap', name: 'Leap', installed: true },
  { id: 'walletconnect', name: 'WalletConnect', installed: true },
  { id: 'cosmostation', name: 'Cosmostation', installed: false },
]

const ETH_OPTIONS: WalletOption[] = [
  { id: 'injected', name: 'MetaMask', installed: true },
  { id: 'coinbaseWallet', name: 'Coinbase Wallet', installed: true },
  { id: 'walletConnect', name: 'WalletConnect', installed: true },
]

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

/** Runs `fn` after the demo's read latency, turning anything thrown into a rejected BridgeError. */
async function later<T>(ms: number, fn: () => T): Promise<T> {
  await delay(ms)
  try {
    return fn()
  } catch (e) {
    throw toBridgeError(e)
  }
}

export function createDemoReaders(sim: DemoSim, deployment: Deployment): { hub: HubReader; eth: EthReader } {
  const read = <T>(fn: () => T) =>
    later(sim.timeline.latencyMs, () => {
      sim.assertOnline()
      return fn()
    })
  const escrow = deployment.hub.escrow

  const hub: HubReader = {
    ownedKids: (owner) => read(() => sim.ownedKids(owner)),
    record: (id) => read(() => sim.record(id)),
    allRecords: () => read(() => sim.allRecords()),
    sendInfo: (id) => read(() => sim.sendInfo(id)),
    sendsBy: (sender) => read(() => sim.sendsBy(sender)),
    latestBlock: () => read(() => sim.latestBlock()),
    block: (height) => read(() => sim.block(height)),
    escrowCw721: () => read(() => deployment.hub.cw721),
  }

  const eth: EthReader = {
    client: () => read(() => sim.client()),
    kidStatus: (ids) => read(() => sim.kidStatus(ids)),
    isContract: (address) => read(() => sim.isContract(address)),
    bridgeEscrow: () =>
      read(() => {
        if (!escrow) throw new BridgeError('NotLive', 'no escrow in this deployment')
        return bytesToHex(decodeBech32(escrow).data)
      }),
  }

  return { hub, eth }
}

export function createDemoHubWriter(sim: DemoSim, address: HubAddress): HubWriter {
  return {
    address,
    simulateSend: (ids, recipient) => later(sim.timeline.latencyMs, () => sim.simulateSend(address, ids, recipient)),
    send: async (ids, recipient, options) => {
      const stage = stageReporter(options?.onStage)
      try {
        stage.report('simulating')
        await later(sim.timeline.latencyMs, () => sim.simulateSend(address, ids, recipient))
        // the "wallet prompt": a declined signature fails here, before anything is broadcast
        stage.report('signing')
        await later(sim.timeline.signMs, () => sim.signSend())
        stage.report('broadcasting')
        return await later(sim.timeline.latencyMs, () => sim.commitSend(address, ids, recipient))
      } finally {
        stage.done()
      }
    },
  }
}

export function createDemoEthWriter(sim: DemoSim, address: EthAddress): EthWriter {
  return {
    address,
    claim: async (ids, options) => {
      const stage = stageReporter(options?.onStage)
      try {
        stage.report('signing')
        const result = await later(sim.timeline.signMs, () => sim.claim(ids))
        // mined as soon as it's signed in the sim; the pause is the block
        stage.report('confirming')
        await delay(sim.timeline.latencyMs)
        return result
      } finally {
        stage.done()
      }
    },
  }
}

/** WalletState over one of the sim's wallets. `wallet` is the snapshot's (immutable) view of it. */
export function createDemoWallet<A extends string>(
  sim: DemoSim,
  chain: DemoChain,
  wallet: DemoWallet,
  wrongChain = false,
): WalletState<A> {
  const options = chain === 'hub' ? HUB_OPTIONS : ETH_OPTIONS
  const ethOnly: Pick<WalletState<A>, 'wrongChain' | 'switchChain'> =
    chain === 'eth'
      ? {
          wrongChain: wallet.status === 'connected' && wrongChain,
          switchChain: async () => {
            await delay(sim.timeline.walletMs)
            try {
              sim.switchChain()
            } catch (e) {
              throw toBridgeError(e)
            }
          },
        }
      : {}
  return {
    ...ethOnly,
    status: wallet.status,
    address: wallet.address as A | undefined,
    walletName: wallet.walletName,
    options,
    connect: async (id) => {
      const option = options.find((o) => o.id === id)
      if (!option) throw new BridgeError('Unknown', `demo: no wallet "${id}"`)
      if (!option.installed) throw new BridgeError('Unknown', `demo: ${option.name} isn't installed`)
      try {
        sim.beginConnect(chain)
      } catch (e) {
        throw toBridgeError(e)
      }
      await delay(sim.timeline.walletMs)
      sim.finishConnect(chain, option.name)
    },
    disconnect: () => {
      sim.disconnect(chain)
      return Promise.resolve()
    },
  }
}
