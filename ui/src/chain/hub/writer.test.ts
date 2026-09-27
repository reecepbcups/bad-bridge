import { fromBase64, fromUtf8, toBase64 } from '@cosmjs/encoding'
import { DirectSecp256k1Wallet, type OfflineDirectSigner } from '@cosmjs/proto-signing'
import { PubKey } from 'cosmjs-types/cosmos/crypto/secp256k1/keys'
import { AuthInfo, Tx, TxBody, TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx'
import { sha256 } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { isBridgeError, type BridgeErrorCode } from '../types'
import { chainError, CW721, ESCROW, json, mockFetch, RECIPIENT, REECE, REST, type Req, testDeployment } from './fixtures'
import { computeFee, createHubWriter, type HubWriterConfig } from './writer'

const ON_CHAIN_PUBKEY = 'Ai1Z5WKc04LI7a2c0/wViuQL+hdAzteRn2YW2X67Z0LN'
const SIMULATED_GAS = '223236' // what sending ReeceBadTest #1 simulated to on mainnet

interface ChainState {
  pubkey?: string | null
  price?: Response | null
  simulate?: (tx: Tx) => Response
  broadcast?: (txBytes: Uint8Array) => Response
  /** Lookups of the tx by hash before it shows up. */
  pendingPolls?: number
  included?: { height: number; code?: number; raw_log?: string } | null
}

/** A fake Hub REST endpoint with an account at sequence 27. */
function chain(state: ChainState = {}) {
  const seen: { simulated: Tx[]; broadcast: Uint8Array[]; polls: number } = { simulated: [], broadcast: [], polls: 0 }
  const { fetch, calls } = mockFetch((req: Req) => {
    const path = req.url.pathname
    if (path.startsWith('/cosmos/auth/v1beta1/accounts/')) {
      const pubkey = state.pubkey === undefined ? ON_CHAIN_PUBKEY : state.pubkey
      return json({
        account: {
          '@type': '/cosmos.auth.v1beta1.BaseAccount',
          address: path.split('/').at(-1),
          pub_key: pubkey ? { '@type': '/cosmos.crypto.secp256k1.PubKey', key: pubkey } : null,
          account_number: '1396771',
          sequence: '27',
        },
      })
    }
    if (path === '/cosmos/tx/v1beta1/simulate') {
      const tx = Tx.decode(fromBase64((req.body as { tx_bytes: string }).tx_bytes))
      seen.simulated.push(tx)
      return state.simulate?.(tx) ?? json({ gas_info: { gas_wanted: '75000000', gas_used: SIMULATED_GAS }, result: { events: [] } })
    }
    if (path === '/feemarket/v1/gas_price/uatom') {
      return state.price === undefined ? json({ price: { denom: 'uatom', amount: '0.005000000000000000' } }) : (state.price ?? new Response('', { status: 501 }))
    }
    if (path === '/cosmos/tx/v1beta1/txs' && req.method === 'POST') {
      const bytes = fromBase64((req.body as { tx_bytes: string }).tx_bytes)
      seen.broadcast.push(bytes)
      return state.broadcast?.(bytes) ?? json({ tx_response: { code: 0, txhash: sha256(bytes).slice(2).toUpperCase(), raw_log: '' } })
    }
    if (path.startsWith('/cosmos/tx/v1beta1/txs/')) {
      seen.polls++
      if (state.included === null || seen.polls <= (state.pendingPolls ?? 1)) return json({ code: 5, message: 'tx not found: 0C72…', details: [] }, 404)
      const inc = state.included ?? { height: 33200000 }
      return json({ tx_response: { height: String(inc.height), txhash: path.split('/').at(-1), code: inc.code ?? 0, raw_log: inc.raw_log ?? '' } })
    }
    return new Response('not routed', { status: 599 })
  })
  return { fetch, calls, seen }
}

function writer(fetch: typeof globalThis.fetch, config: Partial<HubWriterConfig> = {}) {
  return createHubWriter({
    deployment: testDeployment({ rpc: [] }),
    address: REECE,
    transport: { fetch, retries: 0, sleep: () => Promise.resolve() },
    sleep: () => Promise.resolve(),
    pollMs: 1,
    ...config,
  })
}

async function codeOf(p: Promise<unknown>): Promise<{ code: BridgeErrorCode | 'resolved'; tokenId?: number }> {
  try {
    await p
    return { code: 'resolved' }
  } catch (e) {
    if (!isBridgeError(e)) throw e
    return { code: e.code, tokenId: e.tokenId }
  }
}

const TEST_KEY = new Uint8Array(32).fill(7)

describe('fees', () => {
  it('gas = ceil(used × 1.4), fee = ceil(gas × price × 1.5)', () => {
    expect(computeFee(223236n, '0.005000000000000000')).toEqual({ gas: 312531n, fee: 2344n }) // 2343.98 → 2344
    expect(computeFee(223236n, '0.01')).toEqual({ gas: 312531n, fee: 4688n }) // 4687.965 → 4688
    expect(computeFee(100000n, '0.005')).toEqual({ gas: 140000n, fee: 1050n }) // exact, no rounding up
    expect(computeFee(1n, '0.005')).toEqual({ gas: 2n, fee: 1n })
  })
})

describe('simulateSend', () => {
  it('simulates one tx with a send_nft per kid and prices it from the feemarket', async () => {
    const { fetch, seen } = chain()
    await expect(writer(fetch).simulateSend([1, 5], RECIPIENT)).resolves.toEqual({ gas: 312531, amount: '2344', denom: 'uatom' })

    const [tx] = seen.simulated
    expect(tx?.body?.messages).toHaveLength(2)
    const msgs = (tx?.body?.messages ?? []).map((m) => MsgExecuteContract.decode(m.value))
    expect(msgs.map((m) => m.contract)).toEqual([CW721, CW721])
    expect(msgs.map((m) => m.sender)).toEqual([REECE, REECE])
    expect(JSON.parse(fromUtf8(msgs[1]?.msg ?? new Uint8Array()))).toEqual({
      send_nft: { contract: ESCROW, token_id: '5', msg: '0sOSCEdhy25ExUS2853MAB/el3U=' },
    })
    const signer = tx?.authInfo?.signerInfos[0]
    expect(signer?.sequence).toBe(27n)
    expect(toBase64(PubKey.decode(signer?.publicKey?.value ?? new Uint8Array()).key)).toBe(ON_CHAIN_PUBKEY)
  })

  it('falls back to 0.005 (still with headroom) when the feemarket query fails', async () => {
    const { fetch } = chain({ price: null })
    await expect(writer(fetch).simulateSend([1], RECIPIENT)).resolves.toMatchObject({ amount: '2344' })
  })

  it('follows a higher feemarket price', async () => {
    const { fetch } = chain({ price: json({ price: { denom: 'uatom', amount: '0.010000000000000000' } }) })
    await expect(writer(fetch).simulateSend([1], RECIPIENT)).resolves.toMatchObject({ amount: '4688' })
  })

  it.each([
    ['zero address', [1], '0x0000000000000000000000000000000000000000', 'ZeroRecipient'],
    ['19-byte recipient', [1], '0xd2c392084761cb6e44c544b6f39dcc001fde97', 'BadRecipient'],
    ['duplicate kid', [1, 1], RECIPIENT, 'BadTokenId'],
    ['no kids', [], RECIPIENT, 'BadTokenId'],
  ] as const)('refuses a %s before touching the network', async (_, ids, recipient, code) => {
    const { fetch, calls } = chain()
    await expect(codeOf(writer(fetch).simulateSend(ids, recipient as `0x${string}`))).resolves.toMatchObject({ code })
    expect(calls).toHaveLength(0)
  })

  it('maps a failed simulate to the escrow error, with the kid from the message index', async () => {
    const { fetch } = chain({
      simulate: () =>
        chainError(
          "failed to execute message; message index: 1: token 5 already bridged: execute wasm contract failed [CosmWasm/wasmd@v0.60.8/x/wasm/keeper/keeper.go:448] with gas used: '290000'",
        ),
    })
    await expect(codeOf(writer(fetch).simulateSend([1, 5], RECIPIENT))).resolves.toEqual({ code: 'AlreadyBridged', tokenId: 5 })
  })

  it('a never-funded account is InsufficientFunds', async () => {
    const { fetch } = mockFetch(() =>
      json({ code: 5, message: `rpc error: code = NotFound desc = account ${REECE} not found: key not found`, details: [] }, 404),
    )
    await expect(codeOf(writer(fetch).simulateSend([1], RECIPIENT))).resolves.toMatchObject({ code: 'InsufficientFunds' })
  })

  it('is NotLive without an escrow', async () => {
    const { fetch, calls } = chain()
    const w = createHubWriter({ deployment: testDeployment({ escrow: null }), address: REECE, transport: { fetch } })
    await expect(codeOf(w.simulateSend([1], RECIPIENT))).resolves.toMatchObject({ code: 'NotLive' })
    expect(calls).toHaveLength(0)
  })

  it('uses the wallet pubkey for an account that has never signed', async () => {
    const { fetch, seen } = chain({ pubkey: null })
    const pubkey = new Uint8Array(33).fill(3)
    await writer(fetch, { pubkey }).simulateSend([1], RECIPIENT)
    const key = PubKey.decode(seen.simulated[0]?.authInfo?.signerInfos[0]?.publicKey?.value ?? new Uint8Array()).key
    expect([...key]).toEqual([...pubkey])
  })
})

describe('send', () => {
  it('simulates, signs one tx, broadcasts, waits for the block', async () => {
    const wallet = await DirectSecp256k1Wallet.fromKey(TEST_KEY, 'cosmos')
    const [account] = await wallet.getAccounts()
    const address = account?.address ?? ''
    const { fetch, seen } = chain({ pendingPolls: 2, included: { height: 33200001 } })
    const result = await writer(fetch, { address, signer: wallet }).send([1, 5], RECIPIENT)

    expect(seen.broadcast).toHaveLength(1)
    const bytes = seen.broadcast[0] ?? new Uint8Array()
    expect(result).toEqual({ txHash: sha256(bytes).slice(2).toUpperCase(), height: 33200001 })
    expect(seen.polls).toBe(3)

    const raw = TxRaw.decode(bytes)
    const body = TxBody.decode(raw.bodyBytes)
    const auth = AuthInfo.decode(raw.authInfoBytes)
    expect(body.messages.map((m) => JSON.parse(fromUtf8(MsgExecuteContract.decode(m.value).msg)) as unknown)).toEqual([
      { send_nft: { contract: ESCROW, token_id: '1', msg: '0sOSCEdhy25ExUS2853MAB/el3U=' } },
      { send_nft: { contract: ESCROW, token_id: '5', msg: '0sOSCEdhy25ExUS2853MAB/el3U=' } },
    ])
    expect(body.memo).toBe('')
    expect(auth.fee?.gasLimit).toBe(312531n)
    expect(auth.fee?.amount).toEqual([{ denom: 'uatom', amount: '2344' }])
    expect(auth.signerInfos[0]?.sequence).toBe(27n)
    expect(raw.signatures).toHaveLength(1)
    expect(raw.signatures[0]).toHaveLength(64)
  })

  it('never opens the wallet when the simulate fails', async () => {
    const { fetch, seen } = chain({ simulate: () => chainError("failed to execute message; message index: 0: Caller is not the contract's current owner: execute wasm contract failed") })
    const getSigner = vi.fn(() => DirectSecp256k1Wallet.fromKey(TEST_KEY, 'cosmos'))
    await expect(codeOf(writer(fetch, { signer: getSigner }).send([2], RECIPIENT))).resolves.toEqual({ code: 'NotOwner', tokenId: 2 })
    expect(getSigner).not.toHaveBeenCalled()
    expect(seen.broadcast).toHaveLength(0)
  })

  it('a declined signature is UserRejected and nothing is broadcast', async () => {
    const { fetch, seen } = chain()
    const signer: OfflineDirectSigner = {
      getAccounts: () => Promise.resolve([{ address: REECE, algo: 'secp256k1', pubkey: fromBase64(ON_CHAIN_PUBKEY) }]),
      signDirect: () => Promise.reject(new Error('Request rejected')),
    }
    await expect(codeOf(writer(fetch, { signer }).send([1], RECIPIENT))).resolves.toMatchObject({ code: 'UserRejected' })
    expect(seen.broadcast).toHaveLength(0)
  })

  it('a CheckTx rejection is mapped', async () => {
    const wallet = await DirectSecp256k1Wallet.fromKey(TEST_KEY, 'cosmos')
    const address = (await wallet.getAccounts())[0]?.address ?? ''
    const { fetch, seen } = chain({
      broadcast: () => json({ tx_response: { code: 13, raw_log: 'insufficient fees; got: 2344uatom required: 9000uatom: insufficient fee' } }),
    })
    await expect(codeOf(writer(fetch, { address, signer: wallet }).send([1], RECIPIENT))).resolves.toMatchObject({ code: 'InsufficientFunds' })
    expect(seen.polls).toBe(0)
  })

  it('a tx that lands with a non-zero code is an error', async () => {
    const wallet = await DirectSecp256k1Wallet.fromKey(TEST_KEY, 'cosmos')
    const address = (await wallet.getAccounts())[0]?.address ?? ''
    const { fetch } = chain({
      included: { height: 9, code: 5, raw_log: 'spendable balance 1000uatom is smaller than 2344uatom: insufficient funds' },
    })
    await expect(codeOf(writer(fetch, { address, signer: wallet }).send([1], RECIPIENT))).resolves.toMatchObject({ code: 'InsufficientFunds' })
  })

  it('if every broadcast endpoint fails, it still looks for the tx before giving up', async () => {
    const wallet = await DirectSecp256k1Wallet.fromKey(TEST_KEY, 'cosmos')
    const address = (await wallet.getAccounts())[0]?.address ?? ''
    const { fetch, seen } = chain({ broadcast: () => new Response('', { status: 502 }), pendingPolls: 1, included: { height: 77 } })
    await expect(writer(fetch, { address, signer: wallet }).send([1], RECIPIENT)).resolves.toMatchObject({ height: 77 })
    expect(seen.broadcast).toHaveLength(1)
  })

  it('gives up with Network (and the hash) if the tx never shows up', async () => {
    const wallet = await DirectSecp256k1Wallet.fromKey(TEST_KEY, 'cosmos')
    const address = (await wallet.getAccounts())[0]?.address ?? ''
    const { fetch, seen } = chain({ included: null })
    const err = await writer(fetch, { address, signer: wallet, inclusionTimeoutMs: 30 })
      .send([1], RECIPIENT)
      .catch((e: unknown) => e)
    expect(isBridgeError(err) && err.code).toBe('Network')
    const hash = sha256(seen.broadcast[0] ?? new Uint8Array()).slice(2).toUpperCase()
    expect(isBridgeError(err) && err.detail).toContain(hash)
  })

  it('without a signer, send rejects after simulating', async () => {
    const { fetch, calls } = chain()
    await expect(codeOf(writer(fetch).send([1], RECIPIENT))).resolves.toMatchObject({ code: 'Unknown' })
    expect(calls.some((c) => c.url.origin === REST && c.url.pathname === '/cosmos/tx/v1beta1/simulate')).toBe(true)
  })
})
