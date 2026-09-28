// The SP1Stdin bytes for the membership guest program, for one or more escrow records proven together in a
// single batch. Ports main.rs's SP1Stdin construction and bincode-encodes the result the way sp1-sdk does
// before zstd-compressing and uploading it (see chain/succinct/client.ts).

import { bytesToHex, encodeAbiParameters, hexToBytes } from 'viem'

const WASM_PATH_SEGMENT = bytesToHex(new TextEncoder().encode('wasm'))

const KV_PAIR_PARAM = {
  type: 'tuple',
  components: [
    { name: 'path', type: 'bytes[]' },
    { name: 'value', type: 'bytes' },
  ],
} as const

/** Solidity ABI encoding of `KVPair{ path: ["wasm", storeKey], value }` — must match BadBridge.sol's KVPair exactly. */
export function encodeKvPair(storeKey: Uint8Array, value: Uint8Array): Uint8Array {
  const encoded = encodeAbiParameters([KV_PAIR_PARAM], [{ path: [WASM_PATH_SEGMENT, bytesToHex(storeKey)], value: bytesToHex(value) }])
  return hexToBytes(encoded)
}

/** `count` as SP1Stdin sees it: a u16 little-endian chunk (guest ELF's I/O contract expects it before the records). */
function countU16LE(n: number): Uint8Array {
  const out = new Uint8Array(2)
  new DataView(out.buffer).setUint16(0, n, true)
  return out
}

/** One escrow record's proof, ready to feed into stdinChunks. */
export interface StdinRecord {
  storeKey: Uint8Array
  value: Uint8Array
  merkleProofBytes: Uint8Array
}

/**
 * The ordered chunks one `SP1Stdin.write_slice`/`write_vec` call would push, for `records.length` records
 * proven together: app hash, record count, then each record's ABI-encoded KVPair followed by its raw
 * MerkleProof protobuf bytes, in order. Every record must be proven at the same height (the same `appHash`).
 */
export function stdinChunks(appHash: Uint8Array, records: readonly StdinRecord[]): Uint8Array[] {
  const chunks: Uint8Array[] = [appHash, countU16LE(records.length)]
  for (const r of records) chunks.push(encodeKvPair(r.storeKey, r.value), r.merkleProofBytes)
  return chunks
}

function u64le(n: number): Uint8Array {
  const out = new Uint8Array(8)
  new DataView(out.buffer).setBigUint64(0, BigInt(n), true)
  return out
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/**
 * bincode 1.x-encodes an `SP1Stdin { buffer: Vec<Vec<u8>>, ptr: usize, proofs: Vec<...> }` whose `buffer` is
 * `chunks`, with `ptr: 0` and `proofs: []` (this program never uses recursive proof verification). bincode
 * 1.x's default config is little-endian, fixint (no varint), each `Vec` length-prefixed by a u64 LE count —
 * not worth a general bincode dependency for this one fixed shape.
 */
export function encodeSp1Stdin(chunks: readonly Uint8Array[]): Uint8Array {
  const parts: Uint8Array[] = [u64le(chunks.length)]
  for (const chunk of chunks) {
    parts.push(u64le(chunk.length))
    parts.push(chunk)
  }
  parts.push(u64le(0)) // ptr: usize = 0
  parts.push(u64le(0)) // proofs: Vec<...> = empty
  return concat(parts)
}
