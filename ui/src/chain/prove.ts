// Cross-cuts the Hub adapter, the Ethereum adapter and the Succinct network client into one "prove my own
// kid" flow: read the escrow record's Merkle proof, request a Groth16 proof from Succinct, submitBatch it.
// Own-kid-only, batch size always 1 (see the build plan's scope note). Behind real.tsx's lazy boundary like
// hub/ and eth/ already are, so cosmjs-types and the zstd WASM module never load in the demo bundle.

import { bytesToHex, type Hex } from 'viem'
import { readContract } from 'viem/actions'
import type { Deployment } from '../config/deployments'
import { bridgeAbi, lightClientAbi } from './eth/abi'
import { createEthPublicClient } from './eth/client'
import { requireBridge } from './eth/reader'
import type { EthWriterWithBatch } from './eth/writer'
import { escrowRaw, proofHeader, proveAt, storeKey } from './hub/prove'
import { encodeSp1Stdin, stdinChunks } from './hub/stdin'
import { createTransport } from './hub/transport'
import type { SuccinctStage } from './succinct/client'
import { BridgeError, type EthAddress, type KidId } from './types'

export type ProveStage = 'finding-proof' | SuccinctStage | 'signing' | 'confirming'

export interface ProveKidOptions {
  /** Called as the flow reaches each stage. Never called after the promise settles. */
  onStage?: (stage: ProveStage) => void
  /**
   * The recipient the caller already believes this kid is headed to (e.g. from useTrip). If given, it's
   * checked against the Hub's own record before proving — the same sanity check the Rust batcher makes
   * (hub.rs's value-vs-REST cross-check) — since a mismatch here means something is lying, not that the
   * record changed.
   */
  expectedRecipient?: EthAddress
}

export interface ProveKidResult {
  txHash: Hex
}

export interface ProveKidWriter {
  proveKid(id: KidId, options?: ProveKidOptions): Promise<ProveKidResult>
}

export function createProveKidWriter(deployment: Deployment, ethWriter: EthWriterWithBatch): ProveKidWriter {
  const publicClient = createEthPublicClient(deployment)
  const hubTransport = createTransport(deployment.hub)

  async function proveKid(id: KidId, options?: ProveKidOptions): Promise<ProveKidResult> {
    const onStage = options?.onStage
    const bridge = requireBridge(deployment)
    const escrowBech32 = deployment.hub.escrow
    if (!escrowBech32) throw new BridgeError('NotLive', `${deployment.collectionName} has no escrow on the Hub yet`)

    onStage?.('finding-proof')
    const lightClient = await readContract(publicClient, { address: bridge, abi: bridgeAbi, functionName: 'lightClient' })
    const [, , latestHeight, , , isFrozen] = await readContract(publicClient, {
      address: lightClient,
      abi: lightClientAbi,
      functionName: 'clientState',
    })
    if (isFrozen) throw new BridgeError('ClientFrozen', "Ethereum's light client of the Hub is frozen")
    const height = latestHeight.revisionHeight

    const key = storeKey(escrowRaw(escrowBech32), id)
    const proof = await proveAt(hubTransport, Number(height) - 1, key)
    if (!proof) throw new BridgeError('Unknown', `#${id}'s record isn't visible at Hub height ${Number(height) - 1} yet; try again shortly`)
    if (options?.expectedRecipient && bytesToHex(proof.value).toLowerCase() !== options.expectedRecipient.toLowerCase()) {
      throw new BridgeError('Unknown', `#${id}'s on-chain record doesn't match what was expected; refusing to prove it`)
    }
    const header = await proofHeader(hubTransport, Number(height))

    const vkHash = await readContract(publicClient, { address: lightClient, abi: lightClientAbi, functionName: 'MEMBERSHIP_PROGRAM_VKEY' })

    const stdinBytes = encodeSp1Stdin(stdinChunks(header.appHash, key, proof.value, proof.merkleProofBytes))
    const decoded = await ethWriter.requestGroth16Proof(vkHash, stdinBytes, { onStage })

    const cs = { timestamp: header.timestampNs, root: bytesToHex(header.appHash), nextValidatorsHash: bytesToHex(header.nextValidatorsHash) }
    const sp1Proof = { vKey: vkHash, publicValues: decoded.publicValues, proof: decoded.proofBytes }
    return ethWriter.submitBatch(height, cs, sp1Proof, { onStage })
  }

  return { proveKid }
}
