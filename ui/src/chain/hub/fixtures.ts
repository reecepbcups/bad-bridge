// Test-only: mainnet-shaped responses and a routing fetch mock. Imported by *.test.ts only, so never bundled.

import { DEPLOYMENTS, type Deployment } from '../../config/deployments'
import type { ChainEvent } from './events'

export const REECE = 'cosmos1reece3m8g4m3d0qrpj93rnnseudnpzhrey64rr'
export const CW721 = 'cosmos158d2rz0aw8cxx86j0tl8gfwleqyqefr9xdgth2jdfse2d9uumltsu83rfr'
export const ESCROW = 'cosmos1rce3kmvc2v955f64gp8cjtwqzma3qg8t4puk7swmqd56j25gfqgq3s8037'
export const RECIPIENT_HEX = 'd2c392084761cb6e44c544b6f39dcc001fde9775'
export const RECIPIENT = '0xD2C392084761cb6E44c544B6f39dcc001fDe9775'
/** Mainnet tx that bridged ReeceBadTest #2. */
export const TX2 = '0C72F725E53CD2B4EB6159EA0FF2C0C85DA1B9189FD84BA28DEA6F0071BAC2E5'

export const REST = 'https://rest.test'
export const RPC_A = 'https://rpc-a.test'
export const RPC_B = 'https://rpc-b.test'

/** reece-test with fake hosts, so every request in a test is routed on purpose. */
export function testDeployment(overrides: Partial<Deployment['hub']> = {}): Deployment {
  const d = DEPLOYMENTS['reece-test']
  return { ...d, hub: { ...d.hub, rest: [REST], rpc: [RPC_A, RPC_B], ...overrides } }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export function rpcResult(result: unknown): Response {
  return json({ jsonrpc: '2.0', id: 1, result })
}

export function rpcError(data: string): Response {
  return json({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Internal error', data } })
}

/** The SDK's REST error body for a failed execute/simulate. */
export function chainError(message: string, status = 500): Response {
  return json({ code: 2, message, details: [] }, status)
}

export interface Req {
  url: URL
  method: string
  /** Parsed JSON body, if any. */
  body: unknown
}

/** A fetch mock that hands each request to `route`. Records every request. */
export function mockFetch(route: (req: Req) => Response | Promise<Response>) {
  const calls: Req[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const raw = typeof init?.body === 'string' ? init.body : undefined
    const req: Req = { url, method: init?.method ?? 'GET', body: raw ? (JSON.parse(raw) as unknown) : undefined }
    calls.push(req)
    return route(req)
  }
  return { fetch, calls }
}

/** The smart query JSON inside a REST smart-query URL. */
export function smartMsg(url: URL): Record<string, unknown> | null {
  const m = /\/cosmwasm\/wasm\/v1\/contract\/([^/]+)\/smart\/([^/]+)$/.exec(url.pathname)
  if (!m?.[2]) return null
  const b64 = m[2].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(b64)) as Record<string, unknown>
}

export function smartContract(url: URL): string | undefined {
  return /\/cosmwasm\/wasm\/v1\/contract\/([^/]+)\/smart\//.exec(url.pathname)?.[1]
}

function attrs(pairs: Record<string, string>): ChainEvent['attributes'] {
  return Object.entries(pairs).map(([key, value]) => ({ key, value }))
}

/** The cw721's send_nft event for one kid. */
export function sendNftEvent(tokenId: string, msgIndex = 0, cw721 = CW721, sender = REECE): ChainEvent {
  return {
    type: 'wasm',
    attributes: attrs({ _contract_address: cw721, action: 'send_nft', sender, recipient: ESCROW, token_id: tokenId, msg_index: String(msgIndex) }),
  }
}

/** The escrow's bridge event for one kid. */
export function bridgeEvent(tokenId: string, msgIndex = 0, from = REECE, escrow = ESCROW, recipientHex = RECIPIENT_HEX): ChainEvent {
  return {
    type: 'wasm',
    attributes: attrs({ _contract_address: escrow, action: 'bridge', eth_recipient: recipientHex, from, token_id: tokenId, msg_index: String(msgIndex) }),
  }
}

/** A REST tx_response like publicnode returns. */
export function restTx(hash: string, height: number, events: ChainEvent[], code = 0, timestamp = '2026-09-23T21:17:43Z') {
  return { height: String(height), txhash: hash, code, timestamp, events: [{ type: 'message', attributes: attrs({ sender: REECE }) }, ...events] }
}

/** An RPC tx_search tx like polkachu returns. */
export function rpcTx(hash: string, height: number, events: ChainEvent[], code = 0) {
  return { hash, height: String(height), index: 0, tx_result: { code, events }, tx: '' }
}

export function hash(n: number): string {
  return n.toString(16).toUpperCase().padStart(64, '0')
}
