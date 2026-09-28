// bech32 decoding (BIP-173), for the two places outside the adapters that read Hub addresses: the startup
// sanity check and the tracker's lookup box. Both sit in the first chunk the browser loads, and @cosmjs/encoding
// (with @scure/base underneath) would drag every codec it has in with them. Tested against cosmjs' fromBech32.

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3] as const

function polymod(values: readonly number[]): number {
  let chk = 1
  for (const v of values) {
    const top = chk >>> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GENERATOR[i] as number
  }
  return chk
}

function hrpExpand(hrp: string): number[] {
  const codes = [...hrp].map((c) => c.charCodeAt(0))
  return [...codes.map((c) => c >> 5), 0, ...codes.map((c) => c & 31)]
}

/** 5-bit words → bytes. Rejects leftover padding the way BIP-173 decoders must. */
function fromWords(words: readonly number[]): Uint8Array {
  let acc = 0
  let bits = 0
  const out: number[] = []
  for (const w of words) {
    acc = ((acc << 5) | w) & 0xfff
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
    }
  }
  if (bits >= 5) throw new Error('bech32: excess padding')
  if ((acc << (8 - bits)) & 0xff) throw new Error('bech32: non-zero padding')
  return Uint8Array.from(out)
}

/**
 * Decodes a bech32 address, like @cosmjs/encoding's fromBech32. Throws on a bad checksum, mixed case, a bad
 * character or anything over `limit` characters (90, the BIP-173 maximum, by default).
 */
export function decodeBech32(address: string, limit = 90): { prefix: string; data: Uint8Array } {
  if (address.length < 8 || address.length > limit) throw new Error(`bech32: wrong length ${address.length}`)
  const lower = address.toLowerCase()
  if (address !== lower && address !== address.toUpperCase()) throw new Error('bech32: mixed case')
  const sep = lower.lastIndexOf('1')
  if (sep < 1 || sep + 7 > lower.length) throw new Error('bech32: no separator, or data too short')
  const prefix = lower.slice(0, sep)
  if ([...prefix].some((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126)) throw new Error('bech32: bad prefix')
  const values = [...lower.slice(sep + 1)].map((c) => CHARSET.indexOf(c))
  if (values.includes(-1)) throw new Error('bech32: bad character')
  if (polymod([...hrpExpand(prefix), ...values]) !== 1) throw new Error('bech32: bad checksum')
  return { prefix, data: fromWords(values.slice(0, -6)) }
}
