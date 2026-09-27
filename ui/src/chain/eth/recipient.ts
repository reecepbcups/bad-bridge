import { getAddress } from 'viem'
import type { EthAddress } from '../types'

/** Result of checking a typed or pasted Ethereum recipient. */
export type RecipientCheck =
  | { ok: true; address: EthAddress; isConnected: boolean }
  /**
   * format: not 0x + 40 hex. zero: the zero address. checksum: mixed case that fails EIP-55. burn: a precompile or
   * system address (0x…0001 to 0x…ffff) or a well-known burn address, where a minted kid could never move again.
   */
  | { ok: false; reason: 'format' | 'zero' | 'checksum' | 'burn' }

/** Addresses at or below this are precompiles and reserved system addresses on Ethereum. */
const LOW_ADDRESS_MAX = 0xffffn
/** Well-known burn addresses, lowercase. */
const BURN_ADDRESSES: ReadonlySet<string> = new Set(['0x000000000000000000000000000000000000dead'])

/** A precompile, system or well-known burn address. */
export function isBurnAddress(address: string): boolean {
  const lower = address.toLowerCase()
  return BURN_ADDRESSES.has(lower) || BigInt(lower) <= LOW_ADDRESS_MAX
}

/**
 * Validates a recipient before anything is simulated. Pure, so the review screen can run it on every keystroke.
 * `isConnected` drives the "this isn't your connected wallet" note.
 */
export function checkRecipient(input: string, connected?: EthAddress): RecipientCheck {
  const value = input.trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return { ok: false, reason: 'format' }
  if (/^0x0{40}$/.test(value)) return { ok: false, reason: 'zero' }
  const address = getAddress(value)
  const body = value.slice(2)
  // all-lower or all-upper carries no checksum; mixed case must match EIP-55 exactly
  const mixed = body !== body.toLowerCase() && body !== body.toUpperCase()
  if (mixed && value !== address) return { ok: false, reason: 'checksum' }
  if (isBurnAddress(value)) return { ok: false, reason: 'burn' }
  const isConnected = connected !== undefined && connected.toLowerCase() === address.toLowerCase()
  return { ok: true, address, isConnected }
}
