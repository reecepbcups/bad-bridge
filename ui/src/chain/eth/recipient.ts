import { getAddress } from 'viem'
import type { EthAddress } from '../types'

/** Result of checking a typed or pasted Ethereum recipient. */
export type RecipientCheck =
  | { ok: true; address: EthAddress; isConnected: boolean }
  /** format: not 0x + 40 hex. zero: the zero address. checksum: mixed case that fails EIP-55. */
  | { ok: false; reason: 'format' | 'zero' | 'checksum' }

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
  const isConnected = connected !== undefined && connected.toLowerCase() === address.toLowerCase()
  return { ok: true, address, isConnected }
}
