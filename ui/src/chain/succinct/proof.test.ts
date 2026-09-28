import { describe, expect, it } from 'vitest'
import { decodeGroth16ProofFromNetwork } from './proof'

// Hand-encodes a synthetic bincode ProofFromNetwork (Groth16 variant), the same shape sp1-verifier 6.8.0's
// `#[derive(Serialize)]` on SP1Proof/Groth16Bn254Proof/ProofFromNetwork produces, to check the reader against
// a known-good byte layout without needing a real network round trip.
function encodeFixture(opts: { encodedProof: string; groth16VkeyHash: Uint8Array; publicValues: Uint8Array; variant?: number }): Uint8Array {
  const parts: number[] = []
  const u32 = (n: number) => {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setUint32(0, n, true)
    parts.push(...b)
  }
  const u64 = (n: number) => {
    const b = new Uint8Array(8)
    new DataView(b.buffer).setBigUint64(0, BigInt(n), true)
    parts.push(...b)
  }
  const str = (s: string) => {
    const bytes = new TextEncoder().encode(s)
    u64(bytes.length)
    parts.push(...bytes)
  }
  const byteVec = (b: Uint8Array) => {
    u64(b.length)
    parts.push(...b)
  }

  u32(opts.variant ?? 3) // SP1Proof::Groth16
  for (let i = 0; i < 5; i++) str(`public_input_${i}`)
  str(opts.encodedProof)
  str('raw-proof-placeholder')
  if (opts.groth16VkeyHash.length !== 32) throw new Error('fixture: vkey hash must be 32 bytes')
  parts.push(...opts.groth16VkeyHash)
  byteVec(opts.publicValues)
  str('4.0.0-fixture')

  return new Uint8Array(parts)
}

describe('decodeGroth16ProofFromNetwork', () => {
  it('builds proofBytes as vkeyHash[0:4] || decoded encoded_proof, and passes public_values through', () => {
    const groth16VkeyHash = new Uint8Array(32)
    groth16VkeyHash.set([0xde, 0xad, 0xbe, 0xef], 0)
    const publicValues = new Uint8Array([1, 2, 3, 4, 5])
    const fixture = encodeFixture({ encodedProof: 'a1b2c3', groth16VkeyHash, publicValues })

    const decoded = decodeGroth16ProofFromNetwork(fixture)
    expect(decoded.proofBytes).toBe('0xdeadbeefa1b2c3')
    expect(decoded.publicValues).toBe('0x0102030405')
  })

  it('returns an empty proof for a mock (empty encoded_proof)', () => {
    const fixture = encodeFixture({ encodedProof: '', groth16VkeyHash: new Uint8Array(32), publicValues: new Uint8Array([9]) })
    const decoded = decodeGroth16ProofFromNetwork(fixture)
    expect(decoded.proofBytes).toBe('0x')
    expect(decoded.publicValues).toBe('0x09')
  })

  it('rejects a non-Groth16 variant instead of misinterpreting its bytes', () => {
    const fixture = encodeFixture({ encodedProof: 'aa', groth16VkeyHash: new Uint8Array(32), publicValues: new Uint8Array(), variant: 2 })
    expect(() => decodeGroth16ProofFromNetwork(fixture)).toThrow(/variant 2/)
  })
})
