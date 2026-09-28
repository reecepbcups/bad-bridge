// Read-only mainnet checks of the Hub adapter against the reece-test deployment. Nothing here signs anything:
// the simulate endpoint doesn't verify signatures, so the writer core runs with the owner's on-chain pubkey.

import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { DEPLOYMENTS, type Deployment } from '../../src/config/deployments'
import { createHubReader, createHubWriter } from '../../src/chain/hub'
import { isBridgeError } from '../../src/chain/types'

const d = DEPLOYMENTS['reece-test']
const hub = createHubReader(d)
const REECE = 'cosmos1reece3m8g4m3d0qrpj93rnnseudnpzhrey64rr'
const RECIPIENT = getAddress('0xd2c392084761cb6e44c544b6f39dcc001fde9775')
const TX2 = '0C72F725E53CD2B4EB6159EA0FF2C0C85DA1B9189FD84BA28DEA6F0071BAC2E5'
/** The real Bad Kids cw721 (code 434, cw721-migration). */
const BAD_KIDS = 'cosmos12gsv9tmjhhg86wg9fnd9cnju28jx3fxva9cn8dh9meketkfxxajqmg3exz'

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${d.hub.rest[0]}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

async function ownerOf(cw721: string, id: number): Promise<string> {
  const q = btoa(JSON.stringify({ owner_of: { token_id: String(id) } }))
  return (await rest<{ data: { owner: string } }>(`/cosmwasm/wasm/v1/contract/${cw721}/smart/${q}`)).data.owner
}

async function hasPubkey(address: string): Promise<boolean> {
  try {
    return (await rest<{ account: { pub_key: unknown } }>(`/cosmos/auth/v1beta1/accounts/${address}`)).account.pub_key != null
  } catch {
    return false
  }
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
    return 'resolved'
  } catch (e) {
    return e
  }
}

describe('Hub reads (reece-test, mainnet)', () => {
  it('allRecords() is #2 and #3, both to the test recipient', async () => {
    const records = await hub.allRecords()
    expect(records.map((r) => r.tokenId)).toEqual([2, 3])
    for (const r of records) expect(r.recipient).toBe(RECIPIENT)
  })

  it('record(1) is null and record(2) is the recipient', async () => {
    await expect(hub.record(1)).resolves.toBeNull()
    await expect(hub.record(2)).resolves.toEqual({ tokenId: 2, recipient: RECIPIENT })
  })

  it('sendInfo finds Hs: 33092461 for #2 and 33092463 for #3', async () => {
    const two = await hub.sendInfo(2)
    expect(two).toMatchObject({ tokenId: 2, height: 33092461, txHash: TX2, sender: REECE, recipient: RECIPIENT })
    expect(two?.time).toBeInstanceOf(Date)
    await expect(hub.sendInfo(3)).resolves.toMatchObject({ tokenId: 3, height: 33092463, sender: REECE })
    await expect(hub.sendInfo(1)).resolves.toBeNull()
  })

  it('sendsBy(reece) covers #2 and #3, newest first', async () => {
    const sends = await hub.sendsBy(REECE)
    expect(sends.map((s) => s.tokenId)).toEqual(expect.arrayContaining([2, 3]))
    const heights = sends.map((s) => s.height)
    expect(heights).toEqual([...heights].sort((a, b) => b - a))
  })

  it('ownedKids(owner of #1) includes 1', async () => {
    const owner = await ownerOf(d.hub.cw721, 1)
    await expect(hub.ownedKids(owner)).resolves.toContain(1)
  })

  it('escrowCw721() is the deployment cw721', async () => {
    await expect(hub.escrowCw721()).resolves.toBe(d.hub.cw721)
  })

  it('contractInfo(): the test escrow (code 750) and ReeceBadTest both have reece as admin; Bad Kids has its own', async () => {
    await expect(hub.contractInfo(d.hub.escrow ?? '')).resolves.toEqual({ codeId: 750, admin: REECE })
    await expect(hub.contractInfo(d.hub.cw721)).resolves.toEqual({ codeId: 431, admin: REECE })
    await expect(hub.contractInfo(BAD_KIDS)).resolves.toEqual({ codeId: 434, admin: 'cosmos1s8qx0zvz8yd6e4x0mqmqf7fr9vvfn6226hkvrq' })
  })

  it('latestBlock() and block(Hs)', async () => {
    const latest = await hub.latestBlock()
    expect(latest.height).toBeGreaterThan(33092463)
    expect(Date.now() - latest.time.getTime()).toBeLessThan(10 * 60_000)
    const hs = await hub.block(33092461)
    expect(hs).toEqual({ height: 33092461, time: new Date('2026-09-23T21:17:43.623Z') })
  })
})

describe('Hub send simulation (no signature)', () => {
  it('simulates sending #1 from its owner and returns a gas estimate', async () => {
    const owner = await ownerOf(d.hub.cw721, 1)
    const writer = createHubWriter({ deployment: d, address: owner })
    const estimate = await writer.simulateSend([1], RECIPIENT)
    expect(estimate.denom).toBe('uatom')
    expect(estimate.gas).toBeGreaterThan(150_000)
    expect(estimate.gas).toBeLessThan(1_000_000)
    expect(Number(estimate.amount)).toBeGreaterThan(0)
  })

  it('from a non-owner, the simulate fails as NotOwner for that kid', async () => {
    // owns Bad Kids, has signed before, owns no ReeceBadTest
    const stranger = 'cosmos1d8mq46wt2yxsgwrmh6hhfgycl0537w8gtm8xqw'
    const err = await caught(createHubWriter({ deployment: d, address: stranger }).simulateSend([1], RECIPIENT))
    expect(isBridgeError(err) && { code: err.code, tokenId: err.tokenId }).toEqual({ code: 'NotOwner', tokenId: 1 })
  })

  it('refuses the zero address before simulating (the reece-test escrow, code 750, would accept it)', async () => {
    const owner = await ownerOf(d.hub.cw721, 1)
    const err = await caught(createHubWriter({ deployment: d, address: owner }).simulateSend([1], '0x0000000000000000000000000000000000000000'))
    expect(isBridgeError(err) && err.code).toBe('ZeroRecipient')
  })
})

describe('open question: does the Bad Kids cw721 call the receiver hook on send_nft?', () => {
  it('yes: a real Bad Kid sent to the reece-test escrow reaches the escrow, which rejects it as WrongCollection', async () => {
    // find a Bad Kid held by a plain account that has signed before (simulate needs its pubkey)
    let from: { id: number; owner: string } | null = null
    for (const id of [2, 3, 100, 4, 5, 6, 7, 8, 9, 10]) {
      const owner = await ownerOf(BAD_KIDS, id)
      if (await hasPubkey(owner)) {
        from = { id, owner }
        break
      }
    }
    expect(from).not.toBeNull()
    if (!from) return
    const badKidsIntoTestEscrow: Deployment = { ...d, hub: { ...d.hub, cw721: BAD_KIDS } }
    const err = await caught(createHubWriter({ deployment: badKidsIntoTestEscrow, address: from.owner }).simulateSend([from.id], RECIPIENT))
    // the escrow only runs if cw721-migration dispatched ReceiveNft to it
    expect(isBridgeError(err) && err.code).toBe('WrongCollection')
    expect(isBridgeError(err) && err.detail).toContain(`only ${d.hub.cw721} can send nfts here`)
    expect(isBridgeError(err) && err.tokenId).toBe(from.id)
  })
})
