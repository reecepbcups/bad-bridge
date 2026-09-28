// Tx search results (REST and RPC shapes) → SendInfo. A search hit alone proves nothing: its conditions can match
// across different events, so every SendInfo comes from one escrow `wasm` event with action=bridge in a tx with code 0.

import type { EthAddress, HubAddress, KidId, SendInfo } from '../types'
import { parseKidId, recipientFromHex } from './encode'
import { EndpointError } from './transport'

export interface ChainEvent {
  type: string
  attributes: Array<{ key: string; value: string }>
}

/** One tx from either search API, normalized. */
export interface SearchedTx {
  hash: string
  height: number
  code: number
  time?: Date
  events: ChainEvent[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Positive integer from a JSON number or decimal string. */
export function toHeight(v: unknown): number | null {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null
}

/** RFC 3339 with up to nanoseconds ("…T21:17:43.623466258Z"). Trimmed to ms so every engine parses it. */
export function parseChainTime(v: unknown): Date | undefined {
  if (typeof v !== 'string') return undefined
  const d = new Date(v.replace(/(\.\d{3})\d+/, '$1'))
  return Number.isNaN(d.getTime()) ? undefined : d
}

function parseEvents(v: unknown): ChainEvent[] {
  if (!Array.isArray(v)) return []
  const out: ChainEvent[] = []
  for (const e of v) {
    if (!isRecord(e) || typeof e.type !== 'string' || !Array.isArray(e.attributes)) continue
    const attributes: ChainEvent['attributes'] = []
    for (const a of e.attributes) {
      if (isRecord(a) && typeof a.key === 'string' && typeof a.value === 'string') attributes.push({ key: a.key, value: a.value })
    }
    out.push({ type: e.type, attributes })
  }
  return out
}

function parseTotal(v: unknown): number {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) throw new EndpointError(`tx search: bad total ${String(v)}`)
  return n
}

function parseHash(v: unknown): string {
  if (typeof v !== 'string' || !/^[0-9a-fA-F]{64}$/.test(v)) throw new EndpointError(`tx search: bad tx hash ${String(v)}`)
  return v.toUpperCase()
}

function parseHeight(v: unknown): number {
  const h = toHeight(v)
  if (h === null) throw new EndpointError(`tx search: bad height ${String(v)}`)
  return h
}

/** REST `GET /cosmos/tx/v1beta1/txs?query=…` body. */
export function parseRestSearch(body: unknown): { txs: SearchedTx[]; total: number } {
  if (!isRecord(body)) throw new EndpointError('tx search: not an object')
  const responses = body.tx_responses ?? []
  if (!Array.isArray(responses)) throw new EndpointError('tx search: tx_responses is not a list')
  const txs = responses.map((r): SearchedTx => {
    if (!isRecord(r)) throw new EndpointError('tx search: bad tx_response')
    return {
      hash: parseHash(r.txhash),
      height: parseHeight(r.height),
      code: typeof r.code === 'number' ? r.code : 0,
      time: parseChainTime(r.timestamp),
      events: parseEvents(r.events),
    }
  })
  return { txs, total: body.total === undefined ? txs.length : parseTotal(body.total) }
}

/** RPC `tx_search` result. No block time here. */
export function parseRpcSearch(result: unknown): { txs: SearchedTx[]; total: number } {
  if (!isRecord(result) || !Array.isArray(result.txs)) throw new EndpointError('tx_search: no txs')
  const txs = result.txs.map((t): SearchedTx => {
    if (!isRecord(t) || !isRecord(t.tx_result)) throw new EndpointError('tx_search: bad tx')
    return {
      hash: parseHash(t.hash),
      height: parseHeight(t.height),
      code: typeof t.tx_result.code === 'number' ? t.tx_result.code : 0,
      events: parseEvents(t.tx_result.events),
    }
  })
  return { txs, total: parseTotal(result.total_count) }
}

/** Attribute map for one event, or null if a key repeats with different values (ambiguous, so not trusted). */
function attributeMap(e: ChainEvent): Map<string, string> | null {
  const m = new Map<string, string>()
  for (const { key, value } of e.attributes) {
    const prev = m.get(key)
    if (prev !== undefined && prev !== value) return null
    m.set(key, value)
  }
  return m
}

/** Every kid this tx really sent into `escrow`, in event order. Empty for failed txs and look-alike matches. */
export function bridgeSends(tx: SearchedTx, escrow: HubAddress): SendInfo[] {
  if (tx.code !== 0) return []
  const out: SendInfo[] = []
  for (const e of tx.events) {
    if (e.type !== 'wasm') continue
    const a = attributeMap(e)
    if (!a || a.get('_contract_address') !== escrow || a.get('action') !== 'bridge') continue
    const tokenId: KidId | null = parseKidId(a.get('token_id') ?? '')
    const recipient: EthAddress | null = recipientFromHex(a.get('eth_recipient'))
    const sender = a.get('from')
    if (tokenId === null || recipient === null || !sender) continue
    const info: SendInfo = { tokenId, txHash: tx.hash, height: tx.height, sender, recipient }
    if (tx.time) info.time = tx.time
    out.push(info)
  }
  return out
}
