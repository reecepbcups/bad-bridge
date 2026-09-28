// The send_nft `msg` a wallet shows for a recipient, without cosmjs, so the review screen can print it for the
// user to compare against the wallet prompt. hub/encode.ts builds the real message; the test pins them equal.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard base64 (with padding) of `bytes`. */
export function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET.charAt((n >> 18) & 63) + ALPHABET.charAt((n >> 12) & 63)
    out += i + 1 < bytes.length ? ALPHABET.charAt((n >> 6) & 63) : '='
    out += i + 2 < bytes.length ? ALPHABET.charAt(n & 63) : '='
  }
  return out
}

/** base64 of the 20 raw bytes of a 0x address: what the wallet shows as `msg`. null unless it's 0x + 40 hex. */
export function recipientMsg(address: string): string | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null
  const bytes = new Uint8Array(20)
  for (let i = 0; i < 20; i++) bytes[i] = parseInt(address.slice(2 + 2 * i, 4 + 2 * i), 16)
  return base64(bytes)
}
