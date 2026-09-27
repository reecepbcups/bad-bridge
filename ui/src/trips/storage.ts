import type { DeploymentId } from '../config/deployments'
import type { KidId } from '../chain/types'

// Remembers which trips this browser started, so they show up without a lookup. Never required:
// every read and write is wrapped, and a trip's state always comes from chain.

const key = (deployment: DeploymentId) => `bad-bridge:trips:${deployment}`
const listeners = new Set<() => void>()
const cache = new Map<DeploymentId, KidId[]>()

function load(deployment: DeploymentId): KidId[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(deployment)) ?? '[]')
    return Array.isArray(raw) ? raw.filter((n): n is KidId => Number.isInteger(n) && n >= 0) : []
  } catch {
    return []
  }
}

/** Remembered kid ids, oldest first. Returns the same array until it changes. */
export function rememberedTrips(deployment: DeploymentId): KidId[] {
  let ids = cache.get(deployment)
  if (!ids) {
    ids = load(deployment)
    cache.set(deployment, ids)
  }
  return ids
}

export function rememberTrips(deployment: DeploymentId, add: readonly KidId[]): void {
  const next = [...new Set([...rememberedTrips(deployment), ...add])]
  cache.set(deployment, next)
  try {
    localStorage.setItem(key(deployment), JSON.stringify(next))
  } catch {
    // private mode or storage full: remembered for this tab only
  }
  for (const listener of listeners) listener()
}

export function subscribeRemembered(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
