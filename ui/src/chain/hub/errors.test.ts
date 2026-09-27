import { describe, expect, it } from 'vitest'
import { BridgeError } from '../types'
import { chainLogToBridgeError, tokenIdFromLog, toHubError, walletErrorToBridgeError } from './errors'
import { ChainError } from './transport'

const TAIL = ": execute wasm contract failed [CosmWasm/wasmd@v0.60.8/x/wasm/keeper/keeper.go:448] with gas used: '219222'"
const exec = (index: number, err: string) => `failed to execute message; message index: ${index}: ${err}${TAIL}`

describe('chain logs → BridgeError', () => {
  // The first four are verbatim from simulating on mainnet on 2026-09-27; the escrow ones follow escrow/src/lib.rs.
  it.each([
    [
      'real: a Bad Kid sent to the reece-test escrow',
      exec(0, 'only cosmos158d2rz0aw8cxx86j0tl8gfwleqyqefr9xdgth2jdfse2d9uumltsu83rfr can send nfts here'),
      [2],
      'WrongCollection',
      2,
    ],
    ['real: 19-byte recipient', exec(0, 'recipient must be exactly 20 bytes, got 19'), [1], 'BadRecipient', 1],
    ['real: not the owner, second kid', exec(1, "Caller is not the contract's current owner"), [1, 3], 'NotOwner', 3],
    [
      'real: no such token',
      exec(0, 'type: cw721::state::NftInfo<core::option::Option<cosmwasm_std::results::empty::Empty>>; key: [00, 06, 74, 6F, 6B, 65, 6E, 73, 39, 39] not found'),
      [99],
      'NotOwner',
      99,
    ],
    ['old cw721-base Unauthorized', exec(0, 'Unauthorized'), [4], 'NotOwner', 4],
    ['non-canonical id', exec(0, 'token id 07 is not a u32'), [7], 'BadTokenId', 7],
    ['zero recipient', exec(2, 'recipient must not be the zero address'), [1, 2, 3], 'ZeroRecipient', 3],
    ['already bridged, by message index', exec(1, 'token 3 already bridged'), [1, 3], 'AlreadyBridged', 3],
    ['already bridged, no index', 'token 3 already bridged', [], 'AlreadyBridged', 3],
    ['no ATOM', 'spendable balance 0uatom is smaller than 2344uatom: insufficient funds', [1], 'InsufficientFunds', undefined],
    ['fee too low', 'insufficient fees; got: 100uatom required: 2344uatom: insufficient fee', [1], 'InsufficientFunds', undefined],
    [
      'feemarket fee too low',
      'got: 0uatom required: 1563uatom, minGasPrice: 0.005000000000000000uatom: insufficient fee',
      [1],
      'InsufficientFunds',
      undefined,
    ],
    [
      'never-funded account',
      'rpc error: code = NotFound desc = account cosmos1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqnrql8a not found: key not found',
      [1],
      'InsufficientFunds',
      undefined,
    ],
    [
      'bad signature is not NotOwner',
      'signature verification failed; please verify account number (1396771) and chain-id (cosmoshub-4): unauthorized',
      [1],
      'Unknown',
      undefined,
    ],
    ['sequence race', 'account sequence mismatch, expected 28, got 27: incorrect account sequence', [1], 'Unknown', undefined],
    ['out of gas', 'out of gas in location: wasm contract; gasWanted: 300000, gasUsed: 300512: out of gas', [1], 'Unknown', undefined],
  ] as const)('%s', (_, log, ids, code, tokenId) => {
    const e = chainLogToBridgeError(log, ids)
    expect(e).toBeInstanceOf(BridgeError)
    expect(e.code).toBe(code)
    expect(e.tokenId).toBe(tokenId)
    expect(e.detail).toBe(log)
  })

  it('reads the kid from the message index, or from "token N already bridged"', () => {
    expect(tokenIdFromLog(exec(2, 'x'), [10, 20, 30])).toBe(30)
    expect(tokenIdFromLog(exec(5, 'token 7 already bridged'), [1])).toBe(7)
    expect(tokenIdFromLog('nothing here', [1])).toBeUndefined()
  })
})

describe('wallet errors → BridgeError', () => {
  it.each([
    ['Keplr / Leap', new Error('Request rejected'), 'UserRejected'],
    ['Cosmostation', { code: 4001, message: 'User rejected the request.' }, 'UserRejected'],
    ['WalletConnect', new Error('User rejected.'), 'UserRejected'],
    ['Ledger via Keplr', new Error('Transaction rejected'), 'UserRejected'],
    ['Ledger denied', new Error('Ledger device: Condition of use not satisfied (denied by the user?) (0x6985)'), 'UserRejected'],
    ['closed popup', new Error('User closed the popup'), 'UserRejected'],
    ['unknown chain', new Error('There is no chain info for cosmoshub-4'), 'WrongChain'],
    ['anything else', new Error('Failed to retrieve account from signer'), 'Unknown'],
  ] as const)('%s', (_, error, code) => {
    expect(walletErrorToBridgeError(error).code).toBe(code)
  })

  it('passes BridgeErrors through', () => {
    const e = new BridgeError('InsufficientFunds', 'x')
    expect(walletErrorToBridgeError(e)).toBe(e)
    expect(toHubError(e)).toBe(e)
  })
})

describe('toHubError', () => {
  it('maps ChainErrors through the log rules and wraps everything else as Unknown', () => {
    expect(toHubError(new ChainError(exec(0, 'token 2 already bridged'), 2), [2]).code).toBe('AlreadyBridged')
    const other = toHubError(new TypeError('boom'))
    expect(other.code).toBe('Unknown')
    expect(other.detail).toBe('boom')
  })
})
