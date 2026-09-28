// EIP-191 signing for Succinct's prover network, via the same connected wallet that submits the
// eventual submitBatch tx (no separate burner key). Two distinct paths — do not conflate them (see
// sp1-sdk 6.1.0's src/network/utils.rs):
//
// - RequestProofRequestBody / CreateProgramRequestBody: standard EIP-191 personal_sign over the raw
//   protobuf-encoded body bytes, producing the usual 65-byte r||s||v(27/28) signature. This is exactly
//   what a wallet's personal_sign already does — no post-processing needed.
// - CreateArtifact: signs the literal 16 ASCII bytes "create_artifact", but the Rust client's
//   sign_message() helper adds 27 to a v byte that (in the alloy version this repo's Cargo.lock
//   resolves) is *already* 27/28-encoded, producing a non-standard trailing byte of 54 or 55. Replicated
//   here exactly, since the live server's expectations weren't independently verified — if CreateArtifact
//   gets rejected, the first thing to try is the standard 27/28 byte instead (see the build plan).

import { bytesToHex, hexToBytes, recoverMessageAddress, type Account, type Chain, type Client, type Transport } from 'viem'
import { signMessage } from 'viem/actions'
import { BridgeError } from '../types'

// Duplicated from eth/writer.ts's SignerClient rather than imported, so this module never depends on
// eth/writer.ts (which itself depends on succinct/client.ts, which depends on this file — importing the
// type back from eth/writer.ts would make that a cycle).
type SignerClient = Client<Transport, Chain | undefined, Account>

const CREATE_ARTIFACT_MESSAGE = new TextEncoder().encode('create_artifact')

/**
 * Standard EIP-191 personal_sign over raw bytes, as 65 bytes: r(32) || s(32) || v(27 or 28).
 *
 * Verifies the signature actually recovers to `wallet.account.address` before returning it. This matters
 * because a wallet extension's `personal_sign` can silently sign with whatever account is currently active
 * in the extension, not necessarily the one this app thinks is connected (`wallet.account.address` is what
 * the app asked for, not a guarantee of what actually signed) — without this check, a mismatch here doesn't
 * surface until Succinct's network rejects the nonce, with an error naming some unrelated recovered address
 * instead of pointing at the real cause. Live-verified (this session): exactly this happened repeatedly.
 */
export async function signBytes(wallet: SignerClient, message: Uint8Array): Promise<Uint8Array> {
  const raw = bytesToHex(message)
  const sig = await signMessage(wallet, { account: wallet.account, message: { raw } })
  const signer = await recoverMessageAddress({ message: { raw }, signature: sig })
  if (signer.toLowerCase() !== wallet.account.address.toLowerCase()) {
    throw new BridgeError(
      'WrongSigner',
      `wallet signed with ${signer}, not the connected account ${wallet.account.address} — check which account is active in your wallet`,
    )
  }
  return hexToBytes(sig)
}

/**
 * The CreateArtifact signature: EIP-191 over the literal "create_artifact", with the Rust SDK's v+27
 * quirk replicated (final byte 54 or 55, not 27/28). See the module doc comment.
 */
export async function signCreateArtifact(wallet: SignerClient): Promise<Uint8Array> {
  const sig = await signBytes(wallet, CREATE_ARTIFACT_MESSAGE)
  const out = sig.slice()
  const v = out[64]
  if (v === undefined) throw new Error('signCreateArtifact: signature is not 65 bytes')
  out[64] = v + 27
  return out
}
