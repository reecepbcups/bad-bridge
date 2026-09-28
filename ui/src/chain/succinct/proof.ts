// Decodes the Groth16 proof artifact downloaded from Succinct's network. It's bincode-encoded as
// ProofFromNetwork (sp1-verifier 6.8.0's src/proof.rs): an SP1Proof enum (Core=0, Compressed=1, Plonk=2,
// Groth16=3), public_values, and an sp1_version string. This page only ever requests Groth16 mode (main.rs's
// `.groth16()`), so any other discriminant is a hard error rather than something to guess at decoding.
//
// The on-chain bytes ports SP1ProofWithPublicValues::bytes() (sp1-sdk 6.1.0's src/proof.rs): the first 4
// bytes of the Groth16 vkey hash, followed by the hex-decoded encoded_proof.

import { fromHex } from '@cosmjs/encoding'
import { bytesToHex, type Hex } from 'viem'
import { BincodeReader } from './bincode'

/** SP1Proof's Groth16 variant index, per sp1-verifier 6.8.0's enum declaration order. */
const SP1_PROOF_GROTH16_VARIANT = 3

export interface DecodedGroth16Proof {
  /** BadBridge.sol's SP1Proof.proof. */
  proofBytes: Hex
  /** BadBridge.sol's SP1Proof.publicValues. */
  publicValues: Hex
}

/** Decodes a downloaded ProofFromNetwork artifact (Groth16 mode only) into submitBatch's SP1Proof shape. */
export function decodeGroth16ProofFromNetwork(bytes: Uint8Array): DecodedGroth16Proof {
  const r = new BincodeReader(bytes)

  const variant = r.u32()
  if (variant !== SP1_PROOF_GROTH16_VARIANT) {
    throw new Error(`expected a Groth16 proof (variant ${SP1_PROOF_GROTH16_VARIANT}), got variant ${variant}`)
  }
  // Groth16Bn254Proof: public_inputs: [String; 5], encoded_proof: String, raw_proof: String, groth16_vkey_hash: [u8; 32]
  for (let i = 0; i < 5; i++) r.string() // public_inputs — BadBridge.sol re-derives these on-chain, not needed here
  const encodedProof = r.string()
  r.string() // raw_proof — human-readable form, not needed
  const groth16VkeyHash = r.bytes(32)

  // SP1PublicValues { buffer: Buffer { data: Vec<u8>, #[serde(skip)] ptr } } — ptr is never (de)serialized,
  // so on the wire this is just a Vec<u8>.
  const publicValues = r.byteVec()
  r.string() // sp1_version — not needed here

  if (encodedProof.length === 0) {
    // A mock proof: the mock verifier expects an empty proof array. Shouldn't happen against the real
    // network, but matches SP1ProofWithPublicValues::bytes()'s own early return.
    return { proofBytes: '0x', publicValues: bytesToHex(publicValues) }
  }
  const proofBytes = fromHex(encodedProof)
  const combined = new Uint8Array(4 + proofBytes.length)
  combined.set(groth16VkeyHash.subarray(0, 4), 0)
  combined.set(proofBytes, 4)
  return { proofBytes: bytesToHex(combined), publicValues: bytesToHex(publicValues) }
}
