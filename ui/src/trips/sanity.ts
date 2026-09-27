import { decodeBech32 } from '../chain/bech32'
import { bytesToHex, type Hex } from 'viem'
import type { HubAddress } from '../chain/types'
import { isLive, type Deployment } from '../config/deployments'
import type { ConfigProblem, ConfigSanity } from './types'

// The startup check behind the Send button (PLAN.md "Send safety" step 1). Pure, so every branch is testable;
// useConfigSanity() does the two reads and maps read failures to `unknown`.

/** A 32-byte value as 0x hex: what bridge.ESCROW() must return. */
const BYTES32 = /^0x[0-9a-fA-F]{64}$/

/** The deployment's escrow as the raw 32 bytes bridge.ESCROW() should hold, or null if it isn't a 32-byte bech32 address. */
export function escrowBytes32(escrow: HubAddress): Hex | null {
  try {
    const { data } = decodeBech32(escrow)
    return data.length === 32 ? bytesToHex(data) : null
  } catch {
    return null
  }
}

/** The not-live result: the deployment has no escrow or bridge yet. */
export function notLive(): ConfigSanity {
  return { ok: false, status: 'not-live', problems: [withMessage({ code: 'NotLive' })] }
}

/**
 * Compares what the chains say against the deployment.
 * - The escrow's `config {}` cw721 must equal the deployment's cw721 exactly.
 * - bridge.ESCROW() must be 32 bytes and equal the bech32-decoded escrow, ignoring hex case.
 */
export function checkConfig(deployment: Deployment, escrowCw721: HubAddress, bridgeEscrow: Hex): ConfigSanity {
  const escrow = deployment.hub.escrow
  if (!escrow || !isLive(deployment)) return notLive()
  const problems: ConfigProblem[] = []
  if (escrowCw721 !== deployment.hub.cw721) {
    problems.push({ code: 'EscrowCollection', expected: deployment.hub.cw721, actual: escrowCw721 })
  }
  const expected = escrowBytes32(escrow)
  const actual = typeof bridgeEscrow === 'string' ? bridgeEscrow : ('0x' as Hex)
  if (!expected || !BYTES32.test(actual) || actual.toLowerCase() !== expected.toLowerCase()) {
    problems.push({ code: 'BridgeEscrow', expected: expected ?? '0x', actual })
  }
  return { ok: problems.length === 0, status: problems.length ? 'mismatch' : 'ok', problems: problems.map(withMessage) }
}

/** Plain-English copy for one problem. The UI may reword it; this is the fallback and the log line. */
export function describeConfigProblem(problem: ConfigProblem): string {
  switch (problem.code) {
    case 'NotLive':
      return "This collection's bridge isn't live yet: the Hub escrow or the Ethereum bridge hasn't been deployed."
    case 'EscrowCollection':
      return `The Hub escrow accepts ${problem.actual}, not this collection (${problem.expected}).`
    case 'BridgeEscrow':
      if (problem.expected === '0x') return "The configured Hub escrow isn't a valid 32-byte contract address."
      if (!BYTES32.test(problem.actual)) return `The Ethereum bridge's escrow (${problem.actual}) isn't 32 bytes.`
      return `The Ethereum bridge trusts escrow ${problem.actual}, not this collection's (${problem.expected}).`
  }
}

function withMessage(problem: ConfigProblem): ConfigProblem {
  return { ...problem, message: describeConfigProblem(problem) }
}
