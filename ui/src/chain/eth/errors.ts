import {
  BaseError,
  ChainMismatchError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  HttpRequestError,
  InsufficientFundsError,
  LimitExceededRpcError,
  ResourceUnavailableRpcError,
  SocketClosedError,
  SwitchChainError,
  TimeoutError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
  WebSocketRequestError,
  type Hex,
} from 'viem'
import { BridgeError, isBridgeError, type KidId } from '../types'
import { bridgeAbi } from './abi'

// viem / wallet errors → BridgeError. Wagmi errors are matched by name so this file stays viem-only.

/** A decoded BadBridge revert. */
export interface BridgeRevert {
  errorName: string
  args: readonly unknown[]
}

/** Every error in a cause chain, outermost first. Works on viem BaseErrors and plain Errors alike. */
function chain(e: unknown): unknown[] {
  const out: unknown[] = []
  let cur: unknown = e
  while (cur !== undefined && cur !== null && out.length < 16 && !out.includes(cur)) {
    out.push(cur)
    cur = (cur as { cause?: unknown }).cause
  }
  return out
}

function has(e: unknown, test: (x: unknown) => boolean): boolean {
  return chain(e).some(test)
}

function prop(x: unknown, key: string): unknown {
  return typeof x === 'object' && x !== null ? (x as Record<string, unknown>)[key] : undefined
}

function messages(e: unknown): string {
  return chain(e)
    .map((x) => {
      if (x instanceof Error) return x.message
      if (typeof x === 'string') return x
      const message = prop(x, 'message')
      return typeof message === 'string' ? message : ''
    })
    .join('\n')
}

export function isUserRejection(e: unknown): boolean {
  return (
    has(e, (x) => x instanceof UserRejectedRequestError || prop(x, 'code') === 4001 || prop(x, 'code') === 'ACTION_REJECTED') ||
    /user (rejected|denied|cancel)|rejected by (the )?user/i.test(messages(e))
  )
}

export function isInsufficientFunds(e: unknown): boolean {
  return has(e, (x) => x instanceof InsufficientFundsError) || /insufficient funds/i.test(messages(e))
}

export function isWrongChain(e: unknown): boolean {
  return has(
    e,
    (x) =>
      x instanceof ChainMismatchError ||
      x instanceof SwitchChainError ||
      (x instanceof Error && (x.name === 'ConnectorChainMismatchError' || x.name === 'ChainNotConfiguredError')),
  )
}

/** The RPC or its transport failed: timeouts, HTTP errors, rate limits, a dead socket. */
export function isNetworkError(e: unknown): boolean {
  return has(
    e,
    (x) =>
      x instanceof HttpRequestError ||
      x instanceof TimeoutError ||
      x instanceof WebSocketRequestError ||
      x instanceof SocketClosedError ||
      x instanceof LimitExceededRpcError ||
      x instanceof ResourceUnavailableRpcError ||
      x instanceof WaitForTransactionReceiptTimeoutError,
  )
}

/** The decoded BadBridge custom error somewhere in `e`, if the chain reverted with one. */
export function findRevert(e: unknown): BridgeRevert | undefined {
  for (const x of chain(e)) {
    if (x instanceof ContractFunctionRevertedError && x.data?.errorName) {
      return { errorName: x.data.errorName, args: x.data.args ?? [] }
    }
  }
  return undefined
}

/** Decodes raw revert data (e.g. an aggregate3 returnData) against the bridge's errors. */
export function decodeRevert(data: Hex): BridgeRevert | undefined {
  try {
    const { errorName, args } = decodeErrorResult({ abi: bridgeAbi, data })
    return { errorName, args: args ?? [] }
  } catch {
    return undefined
  }
}

/** Maps a decoded claim revert to a BridgeError. `tokenId` is the kid the call was about, when known. */
export function revertToBridgeError(revert: BridgeRevert, tokenId?: KidId, cause?: unknown): BridgeError {
  switch (revert.errorName) {
    case 'NotProven': {
      const id = typeof revert.args[0] === 'number' || typeof revert.args[0] === 'bigint' ? Number(revert.args[0]) : tokenId
      return new BridgeError('NotProven', `kid #${id ?? '?'} isn't proven on Ethereum yet`, { tokenId: id, cause })
    }
    // _mint on a token that exists: someone claimed it first
    case 'ERC721InvalidSender':
      return new BridgeError('NotProven', `kid${tokenId === undefined ? '' : ` #${tokenId}`} is already minted`, { tokenId, cause })
    default:
      return new BridgeError('Unknown', `bridge reverted with ${revert.errorName}`, { tokenId, cause })
  }
}

function short(e: unknown): string {
  if (e instanceof BaseError) return e.shortMessage || e.message
  if (e instanceof Error) return e.message
  return String(e)
}

/**
 * Any Ethereum-side failure → BridgeError. BridgeErrors pass through. Order matters: a wallet can wrap a
 * rejection or an insufficient-funds error in a generic RPC error, so those are checked first.
 */
export function toEthError(e: unknown, tokenId?: KidId): BridgeError {
  if (isBridgeError(e)) return e
  if (isUserRejection(e)) return new BridgeError('UserRejected', short(e), { tokenId, cause: e })
  if (isInsufficientFunds(e)) return new BridgeError('InsufficientFunds', short(e), { tokenId, cause: e })
  const revert = findRevert(e)
  if (revert) return revertToBridgeError(revert, tokenId, e)
  if (isWrongChain(e)) return new BridgeError('WrongChain', short(e), { tokenId, cause: e })
  if (isNetworkError(e)) return new BridgeError('Network', short(e), { tokenId, cause: e })
  return new BridgeError('Unknown', short(e), { tokenId, cause: e })
}
