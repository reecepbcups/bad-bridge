import { decodeBech32 } from '../chain/bech32'
import { checkRecipient } from '../chain/eth/recipient'
import type { EthAddress, HubAddress, KidId } from '../chain/types'

/** What the tracker's lookup box understood. */
export type Lookup =
  | { kind: 'eth'; address: EthAddress }
  | { kind: 'hub'; address: HubAddress }
  | { kind: 'kid'; id: KidId }
  | { kind: 'bad'; message: string }

// COPY: lookup error lines
const HELP = 'Paste an Ethereum address (0x…), a Hub address (cosmos1…) or a kid number like #1234.'

/** Parses an Ethereum address, a Hub address or "#1234". Same rules as the rest of the app, so no surprises later. */
export function parseLookup(input: string, hubPrefix = 'cosmos'): Lookup {
  const value = input.trim()
  if (!value) return { kind: 'bad', message: HELP }

  const id = /^#?\s*(\d+)$/.exec(value)?.[1]
  if (id !== undefined) {
    // canonical u32 decimal, like the escrow and the router
    if (!/^(0|[1-9]\d{0,9})$/.test(id) || Number(id) > 0xffff_ffff) return { kind: 'bad', message: `There's no kid #${id}.` }
    return { kind: 'kid', id: Number(id) }
  }

  if (/^0x/i.test(value)) {
    const check = checkRecipient(value)
    if (check.ok) return { kind: 'eth', address: check.address }
    return {
      kind: 'bad',
      message:
        check.reason === 'checksum'
          ? "That address's capital letters don't match its checksum, so there may be a typo."
          : check.reason === 'zero'
            ? "That's the zero address. No kids go there."
            : "That doesn't look like an Ethereum address (0x + 40 characters).",
    }
  }

  if (value.toLowerCase().startsWith(`${hubPrefix}1`)) {
    try {
      const { prefix } = decodeBech32(value)
      if (prefix === hubPrefix) return { kind: 'hub', address: value.toLowerCase() }
    } catch {
      // fall through
    }
    return { kind: 'bad', message: 'That Hub address has a typo somewhere.' }
  }

  return { kind: 'bad', message: HELP }
}
