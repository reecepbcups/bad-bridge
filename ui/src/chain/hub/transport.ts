// HTTP to the Hub: every REST endpoint first, then the CometBFT RPC fallback list, with a timeout per
// attempt and whole rounds retried with backoff. No cosmjs here, so it stays cheap to test.

import { BridgeError } from '../types'

export type Fetch = typeof globalThis.fetch

export interface TransportOptions {
  /** Defaults to the global fetch. Tests pass a mock. */
  fetch?: Fetch
  /** Per-attempt timeout. Default 12s. */
  timeoutMs?: number
  /** Extra rounds over every endpoint after the first one fails. Default 1. */
  retries?: number
  /** Wait before the first retry round; doubles each round. Default 750ms. */
  backoffMs?: number
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>
}

/** The chain answered and the answer is an error (bad query, contract error, failed simulate). Final: not retried. */
export class ChainError extends Error {
  override readonly name = 'ChainError'
  /** gRPC status (REST) or ABCI code (RPC), when there is one. */
  readonly code: number | undefined
  constructor(message: string, code?: number) {
    super(message)
    this.code = code
  }
}

/** This endpoint couldn't answer: down, slow, rate limited, or it returned something that isn't the API. Try the next. */
export class EndpointError extends Error {
  override readonly name = 'EndpointError'
}

/** One HTTP attempt: fetch with a timeout, JSON in and out, errors classified. */
export interface Http {
  get(url: string): Promise<unknown>
  post(url: string, body: unknown): Promise<unknown>
  /** CometBFT JSON-RPC. A JSON-RPC `error` is an EndpointError: nodes differ (indexer off, pruned), so try the next. */
  rpc(base: string, method: string, params: Record<string, unknown>): Promise<unknown>
}

/** One logical read or write, with a REST form and/or an RPC form. */
export interface Call<T> {
  rest?: (base: string, http: Http) => Promise<T>
  rpc?: (base: string, http: Http) => Promise<T>
}

export interface Transport {
  readonly http: Http
  /** REST endpoints in order, then RPC endpoints, for up to 1 + retries rounds. Throws ChainError as soon as one is seen. */
  run<T>(label: string, call: Call<T>): Promise<T>
}

// gRPC codes that mean "this node, right now" rather than "this request": DeadlineExceeded, ResourceExhausted,
// Unimplemented, Unavailable.
const RETRYABLE_GRPC = new Set([4, 8, 12, 14])
const RETRYABLE_HTTP = new Set([408, 425, 429, 502, 503, 504])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function short(s: string, max = 300): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createHttp(options: TransportOptions = {}): Http {
  const timeoutMs = options.timeoutMs ?? 12_000

  async function request(url: string, init: RequestInit): Promise<unknown> {
    const doFetch = options.fetch ?? globalThis.fetch
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    let text: string
    try {
      res = await doFetch(url, { ...init, signal: controller.signal })
      text = await res.text()
    } catch (e) {
      const why = controller.signal.aborted ? `timed out after ${timeoutMs}ms` : e instanceof Error ? e.message : String(e)
      throw new EndpointError(`${url}: ${why}`)
    } finally {
      clearTimeout(timer)
    }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      throw new EndpointError(`${url}: HTTP ${res.status}, not JSON: ${short(text, 120)}`)
    }
    if (res.ok) return body
    // grpc-gateway errors look like {"code": 2, "message": "...", "details": []}
    if (
      isRecord(body) &&
      typeof body.code === 'number' &&
      body.code !== 0 &&
      typeof body.message === 'string' &&
      !RETRYABLE_GRPC.has(body.code) &&
      !RETRYABLE_HTTP.has(res.status)
    ) {
      throw new ChainError(body.message, body.code)
    }
    throw new EndpointError(`${url}: HTTP ${res.status} ${short(text, 200)}`)
  }

  return {
    get: (url) => request(url, { method: 'GET' }),
    post: (url, body) =>
      request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    async rpc(base, method, params) {
      const body = await request(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      if (!isRecord(body)) throw new EndpointError(`${base} ${method}: not a JSON-RPC response`)
      if (body.error !== undefined) {
        const err = isRecord(body.error) ? body.error : {}
        const detail = [err.message, err.data].filter((x) => typeof x === 'string').join(': ')
        throw new EndpointError(`${base} ${method}: ${short(detail || JSON.stringify(body.error))}`)
      }
      if (!isRecord(body.result)) throw new EndpointError(`${base} ${method}: no result`)
      return body.result
    },
  }
}

export function createTransport(endpoints: { rest: readonly string[]; rpc: readonly string[] }, options: TransportOptions = {}): Transport {
  const http = createHttp(options)
  const retries = options.retries ?? 1
  const backoffMs = options.backoffMs ?? 750
  const sleep = options.sleep ?? realSleep
  const strip = (u: string) => u.replace(/\/+$/, '')
  const rest = endpoints.rest.map(strip)
  const rpc = endpoints.rpc.map(strip)

  return {
    http,
    async run<T>(label: string, call: Call<T>): Promise<T> {
      const attempts: Array<() => Promise<T>> = []
      const { rest: viaRest, rpc: viaRpc } = call
      if (viaRest) for (const base of rest) attempts.push(() => viaRest(base, http))
      if (viaRpc) for (const base of rpc) attempts.push(() => viaRpc(base, http))
      if (attempts.length === 0) throw new BridgeError('Network', `${label}: no endpoints configured`)

      const failures: string[] = []
      for (let round = 0; round <= retries; round++) {
        if (round > 0) await sleep(backoffMs * 2 ** (round - 1))
        for (const attempt of attempts) {
          try {
            return await attempt()
          } catch (e) {
            if (!(e instanceof EndpointError)) throw e
            failures.push(e.message)
          }
        }
      }
      // the last round's failures say the most about why
      throw new BridgeError('Network', `${label}: every endpoint failed. ${short(failures.slice(-attempts.length).join(' | '), 900)}`)
    },
  }
}
