// Hub failures → BridgeError codes. Chain logs look like
//   failed to execute message; message index: 1: token 3 already bridged: execute wasm contract failed [...]
// and the escrow's own strings are in escrow/src/lib.rs (ContractError).

import { BridgeError, isBridgeError, type BridgeErrorCode, type KidId } from '../types'
import { ChainError } from './transport'

interface Rule {
  code: BridgeErrorCode
  test: RegExp
}

// First match wins. Escrow errors first: they're the most specific.
const CHAIN_RULES: readonly Rule[] = [
  { code: 'WrongCollection', test: /only \S+ can send nfts here/i },
  { code: 'BadTokenId', test: /token id .* is not a u32/i },
  { code: 'BadRecipient', test: /recipient must be exactly 20 bytes/i },
  { code: 'ZeroRecipient', test: /recipient must not be the zero address/i },
  { code: 'AlreadyBridged', test: /token \d+ already bridged/i },
  // cw721-base ≥0.16 / cw721 (Ownership NotOwner), older cw721-base ("Unauthorized" from the contract, not the
  // SDK's signature "unauthorized"), a token that doesn't exist
  {
    code: 'NotOwner',
    test: /caller is not the contract's current owner|message index: \d+: unauthori[sz]ed|NftInfo.* not found/i,
  },
  // sender can't cover the fee: no balance, or an account that has never held anything
  { code: 'InsufficientFunds', test: /insufficient funds|account \S+ not found/i },
  // balance is fine, but the offered fee is below what CheckTx wants: a gas-price problem, not a "top up ATOM" one
  { code: 'FeeTooLow', test: /insufficient fees?\b/i },
]

/** Maps a chain error log (simulate, CheckTx or DeliverTx) to a BridgeError. `ids` are the kids in message order. */
export function chainLogToBridgeError(log: string, ids: readonly KidId[] = [], cause?: unknown): BridgeError {
  const code = CHAIN_RULES.find((r) => r.test.test(log))?.code ?? 'Unknown'
  return new BridgeError(code, log, { tokenId: tokenIdFromLog(log, ids), cause })
}

/** The kid a log is about: `message index: N` picks ids[N]; failing that, the escrow's "token N already bridged". */
export function tokenIdFromLog(log: string, ids: readonly KidId[] = []): KidId | undefined {
  const index = /message index: (\d+)/.exec(log)
  if (index?.[1] !== undefined) {
    const id = ids[Number(index[1])]
    if (id !== undefined) return id
  }
  const bridged = /token (\d+) already bridged/.exec(log)
  return bridged?.[1] !== undefined ? Number(bridged[1]) : undefined
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string') return e.message
  return String(e)
}

// Keplr and Leap: "Request rejected". Cosmostation: "User rejected the request." (code 4001).
// WalletConnect: "User rejected." Ledger through Keplr: "Transaction rejected" / "denied by the user".
const REJECTED = /reject|denied|declined|cancel(?:l)?ed|user closed|dismissed/i

/** Maps a wallet failure (connect, sign) to a BridgeError. */
export function walletErrorToBridgeError(e: unknown): BridgeError {
  if (isBridgeError(e)) return e
  const message = messageOf(e)
  const code = typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined
  if (code === 4001 || REJECTED.test(message)) return new BridgeError('UserRejected', message, { cause: e })
  if (/no chain info|chain .*not supported|unknown chain|is not provided in GrazProvider/i.test(message)) {
    return new BridgeError('WrongChain', message, { cause: e })
  }
  return new BridgeError('Unknown', message, { cause: e })
}

/** Anything a Hub read or write can throw → BridgeError. ChainErrors go through the log rules. */
export function toHubError(e: unknown, ids: readonly KidId[] = []): BridgeError {
  if (isBridgeError(e)) return e
  if (e instanceof ChainError) return chainLogToBridgeError(e.message, ids, e)
  return new BridgeError('Unknown', messageOf(e), { cause: e })
}
