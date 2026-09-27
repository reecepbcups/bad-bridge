import { createPublicClient, HttpRequestError } from 'viem'
import { mainnet } from 'viem/chains'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEPLOYMENTS, type Deployment } from '../../config/deployments'
import { BridgeError } from '../types'
import { createEthReader, isContractCode } from './reader'
import { ALICE, BOB, BRIDGE, ESCROW, FakeChain } from './testing/fakeChain'

const deployment = DEPLOYMENTS['reece-test']
const notLive: Deployment = { ...deployment, eth: { ...deployment.eth, bridge: null } }

let chain: FakeChain
const reader = (d: Deployment = deployment, chunkSize?: number) =>
  createEthReader(d, { client: createPublicClient({ chain: mainnet, transport: chain.publicTransport() }), chunkSize })

beforeEach(() => {
  chain = new FakeChain()
})

describe('client', () => {
  it('reads the height and frozen flag through bridge.lightClient()', async () => {
    chain.latestHeight = 33_200_123n
    expect(await reader().client()).toEqual({ latestHeight: 33_200_123, frozen: false })
    chain.frozen = true
    expect(await reader().client()).toEqual({ latestHeight: 33_200_123, frozen: true })
  })
})

describe('kidStatus', () => {
  beforeEach(() => {
    chain.proven.set(2, ALICE).set(3, ALICE).set(4, BOB)
    chain.owners.set(2, ALICE).set(3, BOB)
  })

  it('maps zero proven and nonexistent owners to null, and keys every requested id', async () => {
    const status = await reader().kidStatus([1, 2, 3, 4, 2])
    expect([...status.keys()]).toEqual([1, 2, 3, 4])
    expect(status.get(1)).toEqual({ proven: null, owner: null })
    expect(status.get(2)).toEqual({ proven: ALICE, owner: ALICE })
    // owner can differ from the proven recipient once the kid trades
    expect(status.get(3)).toEqual({ proven: ALICE, owner: BOB })
    expect(status.get(4)).toEqual({ proven: BOB, owner: null })
  })

  it('batches through Multicall3, chunked', async () => {
    const status = await reader(deployment, 2).kidStatus([1, 2, 3, 4, 5])
    expect(status.size).toBe(5)
    expect(chain.publicLog.filter((m) => m === 'eth_call')).toHaveLength(3)
  })

  it('does nothing for no ids', async () => {
    expect((await reader().kidStatus([])).size).toBe(0)
    expect(chain.publicLog).toEqual([])
  })

  it('throws Network when ownerOf fails any other way', async () => {
    chain.brokenOwnerOf.add(2)
    await expect(reader().kidStatus([1, 2])).rejects.toMatchObject({ code: 'Network', tokenId: 2 })
  })

  it('rejects ids that aren\'t u32', async () => {
    for (const id of [-1, 1.5, 2 ** 32, Number.NaN]) {
      await expect(reader().kidStatus([id])).rejects.toMatchObject({ code: 'BadTokenId' })
    }
  })
})

describe('isContract', () => {
  it('is false for empty code and EIP-7702 delegations, true for real code', async () => {
    chain.code.set(ALICE.toLowerCase(), '0xef01008a67b5020ee254ef48e3b6a04927f39baf7e408a')
    chain.code.set(BRIDGE.toLowerCase(), '0x6080604052')
    expect(await reader().isContract(BOB)).toBe(false)
    expect(await reader().isContract(ALICE)).toBe(false)
    expect(await reader().isContract(BRIDGE)).toBe(true)
  })

  it('only treats a 23-byte 0xef0100 designator as a delegation', () => {
    expect(isContractCode(undefined)).toBe(false)
    expect(isContractCode('0x')).toBe(false)
    expect(isContractCode('0xEF01008A67B5020EE254EF48E3B6A04927F39BAF7E408A')).toBe(false)
    expect(isContractCode('0xef01008a67b5020ee254ef48e3b6a04927f39baf7e408a00')).toBe(true)
    expect(isContractCode('0xef0100')).toBe(true)
  })
})

describe('bridgeEscrow', () => {
  it('returns ESCROW() as lowercase hex', async () => {
    expect(await reader().bridgeEscrow()).toBe(ESCROW)
  })
})

describe('failures', () => {
  it('throws NotLive for every bridge read when there is no bridge', async () => {
    const r = reader(notLive)
    await expect(r.client()).rejects.toMatchObject({ code: 'NotLive' })
    await expect(r.kidStatus([1])).rejects.toMatchObject({ code: 'NotLive' })
    await expect(r.bridgeEscrow()).rejects.toMatchObject({ code: 'NotLive' })
    expect(chain.publicLog).toEqual([])
  })

  it('maps transport failures to Network', async () => {
    chain.publicError = new HttpRequestError({ url: 'https://rpc.example', status: 503, body: {} })
    const r = reader()
    for (const p of [r.client(), r.kidStatus([1]), r.isContract(ALICE), r.bridgeEscrow()]) {
      const err = await p.catch((e: unknown) => e)
      expect(err).toBeInstanceOf(BridgeError)
      expect(err).toMatchObject({ code: 'Network' })
    }
  })
})
