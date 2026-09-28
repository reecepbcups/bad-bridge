// Orchestrates a single Groth16 proof request against Succinct's mainnet prover network: checks the
// membership program is registered, uploads the SP1Stdin artifact, fetches live auction parameters and a
// prover whitelist (no guessed/hardcoded values for those — see the build plan's "biggest open risk" note),
// signs and submits the request, then polls until fulfilled and downloads+decodes the Groth16 proof. Every
// field number, enum value and default here was read directly off sp1-sdk 6.1.0's source in
// ~/.cargo/registry (network/{client,prover,utils}.rs and network/proto/**), not guessed.

import { hexToBytes, type Account, type Address, type Chain, type Client, type Hex, type Transport } from 'viem'
import { BridgeError } from '../types'
import { grpcWebCall } from './grpcweb'
import { decodeGroth16ProofFromNetwork, type DecodedGroth16Proof } from './proof'
import { signBytes, signCreateArtifact } from './sign'
import { MessageReader, MessageWriter } from './wire'
import { zstdCompress } from './zstd'

// Duplicated from eth/writer.ts's SignerClient — see sign.ts's comment on why this isn't imported.
type SignerClient = Client<Transport, Chain | undefined, Account>

/** sp1-prover 6.1.0 and 6.8.0 (this repo's Cargo.lock resolves both, for different deps) both pin this. */
const SP1_CIRCUIT_VERSION = 'v6.1.0'
const PROOF_MODE_GROTH16 = 4
const FULFILLMENT_STRATEGY_AUCTION = 3
const ARTIFACT_TYPE_STDIN = 2
const MESSAGE_FORMAT_BINARY = 1
const TRANSACTION_VARIANT_REQUEST = 0
const FULFILLMENT_STATUS_FULFILLED = 3
const FULFILLMENT_STATUS_UNFULFILLABLE = 4

/** sp1-sdk's MAINNET_DEFAULT_CYCLE_LIMIT / DEFAULT_GAS_LIMIT: the skip_simulation defaults, since this
 * client never runs the guest program locally to measure real usage. Pricing is by actual cycles used
 * during proving, not by this ceiling — it's a worst-case bound, same as an Ethereum gas limit. */
const DEFAULT_GAS_LIMIT = 1_000_000_000n
const DEFAULT_CYCLE_LIMIT = 1_000_000_000_000n

/** Ports sp1-sdk's calculate_timeout_from_gas_limit: 5 min floor, 4 hour ceiling, gas_limit/2M in between. */
function calculateTimeoutSecs(gasLimit: bigint): bigint {
  const base = 300n
  const gasBased = gasLimit / 2_000_000n
  const t = gasBased > base ? gasBased : base
  return t < 14400n ? t : 14400n
}

function nowSecs(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type SuccinctStage = 'uploading-stdin' | 'requesting-proof' | 'proving'

export interface RequestGroth16ProofOptions {
  wallet: SignerClient
  /** BadBridge's on-chain MEMBERSHIP_PROGRAM_VKEY. */
  vkHash: Hex
  /** bincode-encoded SP1Stdin (hub/stdin.ts's encodeSp1Stdin output), not yet zstd-compressed. */
  stdinBytes: Uint8Array
  onStage?: (stage: SuccinctStage) => void
  /** How often to poll GetProofRequestStatus while proving. Default 5s. */
  pollMs?: number
  fetchImpl?: typeof fetch
}

async function call(path: string, body: Uint8Array, fetchImpl: typeof fetch): Promise<MessageReader> {
  return new MessageReader(await grpcWebCall(path, body, fetchImpl))
}

async function getNonce(address: Address, fetchImpl: typeof fetch): Promise<bigint> {
  const req = new MessageWriter().bytes32(1, hexToBytes(address)).finish()
  const res = await call('/network.ProverNetwork/GetNonce', req, fetchImpl)
  return res.uint64(1) ?? 0n
}

async function isProgramRegistered(vkHash: Uint8Array, fetchImpl: typeof fetch): Promise<boolean> {
  const req = new MessageWriter().bytes32(1, vkHash).finish()
  const res = await call('/network.ProverNetwork/GetProgram', req, fetchImpl)
  return res.has(1)
}

interface AuctionParams {
  domain: Uint8Array
  auctioneer: Uint8Array
  executor: Uint8Array
  verifier: Uint8Array
  treasury: Uint8Array
  maxPricePerPgu: string
  baseFee: string
}

async function getProofRequestParams(fetchImpl: typeof fetch): Promise<AuctionParams> {
  const req = new MessageWriter().enum(1, PROOF_MODE_GROTH16).finish()
  const res = await call('/network.ProverNetwork/GetProofRequestParams', req, fetchImpl)
  return {
    domain: res.bytes(1) ?? new Uint8Array(),
    auctioneer: res.bytes(2) ?? new Uint8Array(),
    executor: res.bytes(3) ?? new Uint8Array(),
    verifier: res.bytes(4) ?? new Uint8Array(),
    maxPricePerPgu: res.string(5) ?? '0',
    baseFee: res.string(6) ?? '0',
    treasury: res.bytes(7) ?? new Uint8Array(),
  }
}

/** high_availability_only: false is the field's proto3 zero value, so the request body is empty. */
async function getProversByUptime(fetchImpl: typeof fetch): Promise<Uint8Array[]> {
  const res = await call('/network.ProverNetwork/GetProversByUptime', new Uint8Array(), fetchImpl)
  return res.repeatedBytes(1)
}

async function createArtifact(wallet: SignerClient, fetchImpl: typeof fetch): Promise<{ artifactUri: string; presignedUrl: string }> {
  const signature = await signCreateArtifact(wallet)
  const req = new MessageWriter().bytes32(1, signature).enum(2, ARTIFACT_TYPE_STDIN).finish()
  const res = await call('/artifact.ArtifactStore/CreateArtifact', req, fetchImpl)
  const artifactUri = res.string(1)
  const presignedUrl = res.string(2)
  if (!artifactUri || !presignedUrl) throw new BridgeError('Unknown', 'CreateArtifact: missing artifact_uri/artifact_presigned_url')
  return { artifactUri, presignedUrl }
}

async function uploadArtifact(presignedUrl: string, bytes: Uint8Array, fetchImpl: typeof fetch): Promise<void> {
  const res = await fetchImpl(presignedUrl, { method: 'PUT', body: new Blob([new Uint8Array(bytes)]) })
  if (!res.ok) throw new BridgeError('Network', `stdin upload: HTTP ${res.status}`)
}

function buildRequestBody(opts: {
  nonce: bigint
  vkHash: Uint8Array
  stdinUri: string
  deadline: bigint
  cycleLimit: bigint
  gasLimit: bigint
  whitelist: readonly Uint8Array[]
  params: AuctionParams
}): Uint8Array {
  return new MessageWriter()
    .uint64(1, opts.nonce)
    .bytes32(2, opts.vkHash)
    .string(3, `sp1-${SP1_CIRCUIT_VERSION}`)
    .enum(4, PROOF_MODE_GROTH16)
    .enum(5, FULFILLMENT_STRATEGY_AUCTION)
    .string(6, opts.stdinUri)
    .uint64(7, opts.deadline)
    .uint64(8, opts.cycleLimit)
    .uint64(9, opts.gasLimit)
    .uint64(10, 0n) // min_auction_period
    .repeatedBytes(11, opts.whitelist)
    .bytes32(12, opts.params.domain)
    .bytes32(13, opts.params.auctioneer)
    .bytes32(14, opts.params.executor)
    .bytes32(15, opts.params.verifier)
    // 16 public_values_hash: omitted — this client never runs the guest program locally to compute it
    .string(17, opts.params.baseFee)
    .string(18, opts.params.maxPricePerPgu)
    .enum(19, TRANSACTION_VARIANT_REQUEST)
    .bytes32(20, opts.params.treasury)
    .finish()
}

async function requestProof(wallet: SignerClient, body: Uint8Array, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const signature = await signBytes(wallet, body)
  const req = new MessageWriter().enum(1, MESSAGE_FORMAT_BINARY).bytes32(2, signature).message(3, body).finish()
  const res = await call('/network.ProverNetwork/RequestProof', req, fetchImpl)
  const requestId = res.message(2)?.bytes(1)
  if (!requestId) throw new BridgeError('Unknown', 'RequestProof: no request_id in response')
  return requestId
}

interface StatusResult {
  fulfillmentStatus: number
  proofUri: string | undefined
}

async function getProofRequestStatus(requestId: Uint8Array, fetchImpl: typeof fetch): Promise<StatusResult> {
  const req = new MessageWriter().bytes32(1, requestId).finish()
  const res = await call('/network.ProverNetwork/GetProofRequestStatus', req, fetchImpl)
  return { fulfillmentStatus: res.enumValue(1) ?? 0, proofUri: res.string(6) }
}

async function downloadArtifact(uri: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const res = await fetchImpl(uri)
  if (!res.ok) throw new BridgeError('Network', `proof download: HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * Requests a Groth16 membership proof from Succinct's mainnet network and waits for it to be fulfilled.
 * `stage` goes uploading-stdin → requesting-proof → proving. Rejects with a BridgeError.
 */
export async function requestGroth16Proof(opts: RequestGroth16ProofOptions): Promise<DecodedGroth16Proof> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const vkHash = hexToBytes(opts.vkHash)
  const address = opts.wallet.account.address

  if (!(await isProgramRegistered(vkHash, fetchImpl))) {
    throw new BridgeError('Unknown', 'the membership program is not registered on the Succinct network yet')
  }

  opts.onStage?.('uploading-stdin')
  const compressed = await zstdCompress(opts.stdinBytes)
  const { artifactUri, presignedUrl } = await createArtifact(opts.wallet, fetchImpl)
  await uploadArtifact(presignedUrl, compressed, fetchImpl)

  opts.onStage?.('requesting-proof')
  const [nonce, params, whitelist] = await Promise.all([getNonce(address, fetchImpl), getProofRequestParams(fetchImpl), getProversByUptime(fetchImpl)])
  const deadline = nowSecs() + calculateTimeoutSecs(DEFAULT_GAS_LIMIT)
  const body = buildRequestBody({
    nonce,
    vkHash,
    stdinUri: artifactUri,
    deadline,
    cycleLimit: DEFAULT_CYCLE_LIMIT,
    gasLimit: DEFAULT_GAS_LIMIT,
    whitelist,
    params,
  })
  const requestId = await requestProof(opts.wallet, body, fetchImpl)

  opts.onStage?.('proving')
  const pollMs = opts.pollMs ?? 5000
  for (;;) {
    const status = await getProofRequestStatus(requestId, fetchImpl)
    if (status.fulfillmentStatus === FULFILLMENT_STATUS_FULFILLED) {
      if (!status.proofUri) throw new BridgeError('Unknown', 'proof fulfilled but no proof_uri in the status response')
      return decodeGroth16ProofFromNetwork(await downloadArtifact(status.proofUri, fetchImpl))
    }
    if (status.fulfillmentStatus === FULFILLMENT_STATUS_UNFULFILLABLE) {
      throw new BridgeError('Unknown', 'the proof request became unfulfillable')
    }
    if (nowSecs() > deadline) throw new BridgeError('Unknown', 'the proof request passed its deadline without being fulfilled')
    await sleep(pollMs)
  }
}
