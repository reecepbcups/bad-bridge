import { createPublicClient, createWalletClient, decodeFunctionData, getAddress } from 'viem'
import { mainnet } from 'viem/chains'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEPLOYMENTS, type Deployment } from '../../config/deployments'
import { BridgeError, type EthReader, type KidEthStatus, type KidId } from '../types'
import { bridgeAbi, multicall3WriteAbi } from './abi'
import { ALICE, BOB, BRIDGE, FAKE_GAS, FakeChain, MULTICALL3 } from './testing/fakeChain'
import { createEthWriter, sortClaimable } from './writer'

const deployment = DEPLOYMENTS['reece-test']
const SIGNER = getAddress('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266')

let chain: FakeChain

function writer(options: { deployment?: Deployment; reader?: EthReader } = {}) {
  return createEthWriter({
    deployment: options.deployment ?? deployment,
    publicClient: createPublicClient({ chain: mainnet, transport: chain.publicTransport(), pollingInterval: 10 }),
    walletClient: createWalletClient({ account: SIGNER, chain: mainnet, transport: chain.walletTransport() }),
    reader: options.reader,
  })
}

/** A reader stuck in the past: says every kid is proven and unminted, whatever the chain says. */
const staleReader = {
  kidStatus: (ids: readonly KidId[]) =>
    Promise.resolve(new Map(ids.map((id): [KidId, KidEthStatus] => [id, { proven: ALICE, owner: null }]))),
} as EthReader

/** The kid ids a sent tx claims, whether direct or through aggregate3. */
function claimedIn(data: `0x${string}`, to: string): { ids: number[]; allowFailure?: boolean[] } {
  if (to === BRIDGE) return { ids: [decodeFunctionData({ abi: bridgeAbi, data }).args?.[0] as number] }
  const { args } = decodeFunctionData({ abi: multicall3WriteAbi, data })
  return {
    ids: args[0].map((c) => decodeFunctionData({ abi: bridgeAbi, data: c.callData }).args?.[0] as number),
    allowFailure: args[0].map((c) => c.allowFailure),
  }
}

beforeEach(() => {
  chain = new FakeChain()
  chain.proven.set(1, ALICE).set(2, ALICE).set(3, BOB).set(4, ALICE)
  chain.owners.set(4, ALICE)
})

describe('claim', () => {
  it('claims one kid with bridge.claim and waits for the receipt', async () => {
    const w = writer()
    expect(w.address).toBe(SIGNER)
    const { txHash } = await w.claim([1])
    expect(chain.sent).toHaveLength(1)
    const [tx] = chain.sent
    expect(tx).toMatchObject({ hash: txHash, to: BRIDGE })
    expect(claimedIn(tx!.data, tx!.to).ids).toEqual([1])
    expect(chain.owners.get(1)).toBe(ALICE)
  })

  it('claims several kids in one aggregate3 with allowFailure, gas from the strict twin plus 25%', async () => {
    await writer().claim([1, 2, 3])
    expect(chain.sent).toHaveLength(1)
    const [tx] = chain.sent
    expect(tx!.to).toBe(MULTICALL3)
    expect(claimedIn(tx!.data, tx!.to)).toEqual({ ids: [1, 2, 3], allowFailure: [true, true, true] })
    expect(tx!.gas).toBe((FAKE_GAS * 5n) / 4n)
    const strict = chain.estimates.at(-1)!
    expect(claimedIn(strict.data, getAddress(strict.to)).allowFailure).toEqual([false, false, false])
    expect(chain.owners.get(3)).toBe(BOB)
  })

  it('skips kids that are minted or unproven, and dedupes', async () => {
    await writer().claim([4, 1, 5, 1, 2])
    const [tx] = chain.sent
    expect(claimedIn(tx!.data, tx!.to).ids).toEqual([1, 2])
  })

  it('refuses with NotProven, saying why, when nothing is left to claim', async () => {
    const minted = await writer().claim([4]).catch((e: unknown) => e)
    expect(minted).toMatchObject({ code: 'NotProven', tokenId: 4, detail: 'already minted: #4' })

    const unproven = await writer().claim([5, 6]).catch((e: unknown) => e)
    expect(unproven).toMatchObject({ code: 'NotProven', tokenId: 5, detail: 'not proven yet: #5, #6' })

    const both = await writer().claim([4, 5]).catch((e: unknown) => e)
    expect(both).toMatchObject({ code: 'NotProven', detail: 'already minted: #4; not proven yet: #5' })
    expect(chain.sent).toHaveLength(0)
  })

  it('drops batch members the simulation says will fail (claimed meanwhile)', async () => {
    chain.owners.set(2, ALICE)
    await writer({ reader: staleReader }).claim([1, 2, 3])
    const [tx] = chain.sent
    expect(tx!.to).toBe(MULTICALL3)
    expect(claimedIn(tx!.data, tx!.to).ids).toEqual([1, 3])
  })

  it('falls back to a direct claim when only one batch member survives', async () => {
    chain.owners.set(2, ALICE)
    await writer({ reader: staleReader }).claim([1, 2])
    const [tx] = chain.sent
    expect(tx!.to).toBe(BRIDGE)
    expect(claimedIn(tx!.data, tx!.to).ids).toEqual([1])
  })

  it('decodes NotProven(uint32) from a reverted simulation', async () => {
    const one = await writer({ reader: staleReader }).claim([9]).catch((e: unknown) => e)
    expect(one).toBeInstanceOf(BridgeError)
    expect(one).toMatchObject({ code: 'NotProven', tokenId: 9 })

    const batch = await writer({ reader: staleReader }).claim([9, 10]).catch((e: unknown) => e)
    expect(batch).toMatchObject({ code: 'NotProven', tokenId: 9 })
    expect(chain.sent).toHaveLength(0)
  })

  it('maps an already-minted simulation revert to NotProven', async () => {
    const err = await writer({ reader: staleReader }).claim([4]).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'NotProven', tokenId: 4 })
    expect((err as BridgeError).detail).toMatch(/already minted/)
  })

  it('refuses with WrongChain before reading or sending anything', async () => {
    chain.walletChainId = 137
    const err = await writer().claim([1]).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'WrongChain' })
    expect(chain.publicLog).not.toContain('eth_call')
    expect(chain.sent).toHaveLength(0)
  })

  it('maps a wallet rejection to UserRejected', async () => {
    chain.walletError = Object.assign(new Error('User rejected the request.'), { code: 4001 })
    await expect(writer().claim([1])).rejects.toMatchObject({ code: 'UserRejected', tokenId: 1 })
    await expect(writer().claim([1, 2])).rejects.toMatchObject({ code: 'UserRejected' })
  })

  it('maps insufficient funds to InsufficientFunds', async () => {
    chain.walletError = Object.assign(new Error('insufficient funds for gas * price + value'), { code: -32000 })
    await expect(writer().claim([1])).rejects.toMatchObject({ code: 'InsufficientFunds' })
  })

  it('fails when the receipt says reverted', async () => {
    chain.revertNextTx = true
    const err = await writer().claim([1]).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'Unknown' })
    expect((err as BridgeError).detail).toMatch(/reverted/)
  })

  it('throws NotLive without a bridge, BadTokenId for junk ids', async () => {
    const notLive = { ...deployment, eth: { ...deployment.eth, bridge: null } }
    await expect(writer({ deployment: notLive }).claim([1])).rejects.toMatchObject({ code: 'NotLive' })
    await expect(writer().claim([-1])).rejects.toMatchObject({ code: 'BadTokenId' })
  })

  it('works with a lazy wallet getter (the wagmi wrapper uses one)', async () => {
    let calls = 0
    const w = createEthWriter({
      deployment,
      address: SIGNER,
      publicClient: createPublicClient({ chain: mainnet, transport: chain.publicTransport() }),
      getWalletClient: () => {
        calls++
        return Promise.resolve(createWalletClient({ account: SIGNER, chain: mainnet, transport: chain.walletTransport() }))
      },
    })
    expect(w.address).toBe(SIGNER)
    expect(calls).toBe(0)
    await w.claim([1])
    expect(calls).toBe(1)
  })
})

describe('sortClaimable', () => {
  it('splits ids by what the chain says', () => {
    const status = new Map<KidId, KidEthStatus>([
      [1, { proven: ALICE, owner: null }],
      [2, { proven: ALICE, owner: BOB }],
      [3, { proven: null, owner: null }],
    ])
    expect(sortClaimable([1, 2, 3, 4], status)).toEqual({ claimable: [1], minted: [2], unproven: [3, 4] })
  })
})
