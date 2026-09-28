// Where the page is served from. A path-based IPFS gateway (ipfs.io/ipfs/<cid>/) or a GitHub project page
// (user.github.io/repo/) shares its origin with every other page there, and any of them can script this app and
// reuse the wallets' site permissions. Sending is switched off on hosts like that.

/** Why this host is unsafe to send from, or null when it has an origin of its own. */
export type SharedHost = 'ipfs-path' | 'path-gateway' | 'github-pages'

/** Gateways that serve every CID under one origin. Subdomain gateways (<cid>.ipfs.dweb.link) are fine. */
const PATH_GATEWAYS: ReadonlySet<string> = new Set([
  'ipfs.io',
  'gateway.ipfs.io',
  'dweb.link',
  'www.dweb.link',
  'gateway.pinata.cloud',
  'cloudflare-ipfs.com',
])

/** Checks a location. Pure, so every branch is testable. */
export function sharedHost(where: { hostname: string; pathname: string }): SharedHost | null {
  const host = where.hostname.toLowerCase().replace(/\.$/, '')
  if (/\/ip[fn]s\//i.test(where.pathname)) return 'ipfs-path'
  if (PATH_GATEWAYS.has(host)) return 'path-gateway'
  if (host.endsWith('.github.io') && !/^\/(index\.html)?$/.test(where.pathname)) return 'github-pages'
  return null
}

/** This page's host problem, fixed at load. null in tests and on a dedicated origin. */
export const hostProblem: SharedHost | null = typeof location === 'undefined' ? null : sharedHost(location)
