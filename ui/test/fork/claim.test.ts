// Claims against a local Anvil fork of mainnet, through the real writer core (no wagmi).
// Seeds proofs with anvil_setStorageAt on the reece-test BadBridge, then claims one kid directly and two through
// Multicall3. Needs `anvil` on PATH and network for the fork's upstream RPC; skips without anvil.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  decodeFunctionData,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  pad,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bridgeAbi, multicall3WriteAbi } from '../../src/chain/eth/abi'
import { createEthReader } from '../../src/chain/eth/reader'
import { createEthWriter } from '../../src/chain/eth/writer'
import { BridgeError, type EthReader, type KidEthStatus, type KidId } from '../../src/chain/types'
import { DEPLOYMENTS } from '../../src/config/deployments'

const FORK_URL = 'https://ethereum-rpc.publicnode.com'
const deployment = DEPLOYMENTS['reece-test']
const BRIDGE = '0xDe185D7902340086cc4C37322584e246DC5eE198' as const
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const

// `forge inspect BadBridge storage-layout` (eth/, OZ c64a1edb): _name 0, _symbol 1, _owners 2, _balances 3,
// _tokenApprovals 4, _operatorApprovals 5, clientId 6, baseURI 7, proven 8. ROUTER and ESCROW are immutables.
const PROVEN_SLOT = 8n

// anvil's well-known dev accounts (mnemonic "test test … junk"). #0 claims, #1 is the proven recipient,
// so the test also shows claim() mints to the proven address whoever sends it.
const CLAIMER_KEY: Hex = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const RECIPIENT: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
// holds reece-test #2 and #3 on mainnet (EIP-55: 0xD2C392084761cb6E44c544B6f39dcc001fDe9775)
const REECE: Address = getAddress('0xd2c392084761cb6e44c544b6f39dcc001fde9775')

const hasAnvil = spawnSync('anvil', ['--version']).status === 0

function provenSlot(id: KidId): Hex {
  return keccak256(encodeAbiParameters([{ type: 'uint32' }, { type: 'uint256' }], [id, PROVEN_SLOT]))
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

describe.skipIf(!hasAnvil)('claim on an anvil mainnet fork', () => {
  let anvil: ChildProcess | undefined
  let url = ''
  let publicClient: PublicClient
  let reader: EthReader

  const account = privateKeyToAccount(CLAIMER_KEY)
  const writer = () =>
    createEthWriter({
      deployment,
      publicClient,
      walletClient: createWalletClient({ account, chain: mainnet, transport: http(url) }),
    })
  const ownerOf = (id: KidId) => publicClient.readContract({ address: BRIDGE, abi: bridgeAbi, functionName: 'ownerOf', args: [BigInt(id)] })

  beforeAll(async () => {
    const port = await freePort()
    url = `http://127.0.0.1:${port}`
    let log = ''
    const proc = spawn('anvil', ['--fork-url', FORK_URL, '--port', String(port), '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] })
    anvil = proc
    proc.stdout.on('data', (d: Buffer) => (log += d.toString()))
    proc.stderr.on('data', (d: Buffer) => (log += d.toString()))

    publicClient = createPublicClient({ chain: mainnet, transport: http(url, { retryCount: 0 }), pollingInterval: 100 })
    const deadline = Date.now() + 60_000
    for (;;) {
      if (proc.exitCode !== null) throw new Error(`anvil exited (${proc.exitCode}):\n${log}`)
      try {
        await publicClient.getChainId()
        break
      } catch {
        if (Date.now() > deadline) throw new Error(`anvil didn't come up in 60s:\n${log}`)
        await new Promise((r) => setTimeout(r, 250))
      }
    }

    const test = createTestClient({ mode: 'anvil', chain: mainnet, transport: http(url) })
    await test.setBalance({ address: account.address, value: parseEther('10') })
    for (const id of [1, 7, 8, 10, 11, 12]) {
      await test.setStorageAt({ address: BRIDGE, index: provenSlot(id), value: pad(RECIPIENT) })
    }
    reader = createEthReader(deployment, { client: publicClient })
  })

  afterAll(() => {
    anvil?.kill('SIGTERM')
  })

  it('reads the seeded proofs and mainnet state', async () => {
    const status = await reader.kidStatus([1, 2, 3, 7, 8, 9])
    expect([...status.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 7, 8, 9])
    for (const id of [1, 7, 8]) expect(status.get(id)).toEqual({ proven: RECIPIENT, owner: null })
    expect(status.get(2)).toEqual({ proven: REECE, owner: REECE })
    expect(status.get(9)).toEqual({ proven: null, owner: null })

    const client = await reader.client()
    expect(client.latestHeight).toBeGreaterThan(33_092_463)
    expect(client.frozen).toBe(false)
    // anvil's dev accounts carry EIP-7702 delegations on mainnet: still EOAs
    expect(await reader.isContract(account.address)).toBe(false)
    expect(await reader.isContract(BRIDGE)).toBe(true)
  })

  it('claims one kid with bridge.claim', async () => {
    const { txHash } = await writer().claim([1])
    const tx = await publicClient.getTransaction({ hash: txHash })
    expect(tx.to?.toLowerCase()).toBe(BRIDGE.toLowerCase())
    expect(await ownerOf(1)).toBe(RECIPIENT)
  })

  it('claims several kids in one Multicall3 transaction', async () => {
    const { txHash } = await writer().claim([7, 8])
    const tx = await publicClient.getTransaction({ hash: txHash })
    expect(tx.to?.toLowerCase()).toBe(MULTICALL3.toLowerCase())
    expect(await ownerOf(7)).toBe(RECIPIENT)
    expect(await ownerOf(8)).toBe(RECIPIENT)
  })

  it('refuses an already-minted kid with NotProven', async () => {
    const err = await writer().claim([1]).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BridgeError)
    expect(err).toMatchObject({ code: 'NotProven', tokenId: 1 })
    expect((err as BridgeError).detail).toMatch(/already minted: #1/)

    const mixed = await writer().claim([1, 9]).catch((e: unknown) => e)
    expect(mixed).toMatchObject({ code: 'NotProven' })
    expect((mixed as BridgeError).detail).toBe('already minted: #1; not proven yet: #9')
  })

  it('drops a kid someone else claimed between the status read and the send', async () => {
    // #11 gets minted behind the writer's back; the writer's stale reader still thinks it's claimable
    await createWalletClient({ account, chain: mainnet, transport: http(url) }).writeContract({
      address: BRIDGE,
      abi: bridgeAbi,
      functionName: 'claim',
      args: [11],
    })
    const stale: EthReader = {
      ...reader,
      kidStatus: (ids) => Promise.resolve(new Map(ids.map((id): [KidId, KidEthStatus] => [id, { proven: RECIPIENT, owner: null }]))),
    }
    const { txHash } = await createEthWriter({
      deployment,
      publicClient,
      reader: stale,
      walletClient: createWalletClient({ account, chain: mainnet, transport: http(url) }),
    }).claim([10, 11, 12])
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
    expect(receipt.status).toBe('success')
    expect(receipt.to?.toLowerCase()).toBe(MULTICALL3.toLowerCase())
    // the simulation dropped #11, so the batch that went out claims only #10 and #12
    const tx = await publicClient.getTransaction({ hash: txHash })
    const { args } = decodeFunctionData({ abi: multicall3WriteAbi, data: tx.input })
    const claimed = args[0].map((call) => decodeFunctionData({ abi: bridgeAbi, data: call.callData }).args[0])
    expect(claimed).toEqual([10, 12])
    expect(await ownerOf(10)).toBe(RECIPIENT)
    expect(await ownerOf(12)).toBe(RECIPIENT)
  })

  it('shows every claim in kidStatus', async () => {
    const status = await reader.kidStatus([1, 2, 3, 7, 8, 9, 10, 11, 12])
    for (const id of [1, 7, 8, 10, 11, 12]) expect(status.get(id)).toEqual({ proven: RECIPIENT, owner: RECIPIENT })
    expect(status.get(3)).toEqual({ proven: REECE, owner: REECE })
    expect(status.get(9)).toEqual({ proven: null, owner: null })
  })
})
