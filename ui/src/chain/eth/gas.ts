// Typical claim gas, measured on a mainnet fork: claim(id) alone uses ~79k; each extra kid in one aggregate3
// adds ~30k (2 kids → 107k, 5 → 198k, 50 → 1.56M). Dependency-free so the demo can share it.

export const CLAIM_GAS_FIRST = 79_000n
export const CLAIM_GAS_EXTRA = 30_000n

/** Typical gas to claim `n` kids in one transaction. */
export function typicalClaimGas(n: number): bigint {
  return CLAIM_GAS_FIRST + CLAIM_GAS_EXTRA * BigInt(Math.max(0, n - 1))
}
