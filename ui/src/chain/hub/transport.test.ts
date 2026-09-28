import { describe, expect, it, vi } from 'vitest'
import { isBridgeError } from '../types'
import { chainError, json, mockFetch, REST, RPC_A, RPC_B, rpcError, rpcResult } from './fixtures'
import { ChainError, createTransport, EndpointError, type Call } from './transport'

const endpoints = { rest: [REST], rpc: [RPC_A, RPC_B] }

/** A call that GETs /x over REST and does a `status` JSON-RPC call over RPC. */
const call: Call<string> = {
  rest: async (base, http) => {
    const body = (await http.get(`${base}/x`)) as { v?: string }
    if (!body.v) throw new EndpointError('no v')
    return `rest:${body.v}`
  },
  rpc: async (base, http) => {
    const result = (await http.rpc(base, 'status', {})) as { v?: string }
    return `rpc:${base}:${result.v ?? ''}`
  },
}

describe('transport', () => {
  it('uses REST when it answers', async () => {
    const { fetch, calls } = mockFetch(() => json({ v: 'ok' }))
    const t = createTransport(endpoints, { fetch })
    await expect(t.run('x', call)).resolves.toBe('rest:ok')
    expect(calls).toHaveLength(1)
  })

  it('falls back to the RPC list in order when REST is down', async () => {
    const { fetch, calls } = mockFetch(({ url }) => {
      if (url.origin === REST) return new Response('<html>bad gateway</html>', { status: 502 })
      if (url.origin === RPC_A) return rpcError('transaction indexing is disabled')
      return rpcResult({ v: 'b' })
    })
    const t = createTransport(endpoints, { fetch })
    await expect(t.run('x', call)).resolves.toBe(`rpc:${RPC_B}:b`)
    expect(calls.map((c) => c.url.origin)).toEqual([REST, RPC_A, RPC_B])
    expect(calls[1]?.method).toBe('POST')
    expect(calls[1]?.body).toMatchObject({ jsonrpc: '2.0', method: 'status' })
  })

  it('treats a chain error as final: no retry, no fallback', async () => {
    const { fetch, calls } = mockFetch(() => chainError('failed to execute message; message index: 0: nope'))
    const t = createTransport(endpoints, { fetch })
    const err = await t.run('x', call).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ChainError)
    expect((err as ChainError).message).toContain('message index: 0: nope')
    expect(calls).toHaveLength(1)
  })

  it('retries rate limits and gRPC Unavailable as endpoint trouble', async () => {
    const { fetch, calls } = mockFetch(({ url }) =>
      url.origin === REST ? json({ code: 8, message: 'rate limited' }, 429) : json({ code: 14, message: 'unavailable' }, 503),
    )
    const sleep = vi.fn(() => Promise.resolve())
    const t = createTransport(endpoints, { fetch, sleep, retries: 2, backoffMs: 100 })
    const err = await t.run('thing', call).catch((e: unknown) => e)
    expect(isBridgeError(err) && err.code).toBe('Network')
    expect(isBridgeError(err) && err.detail).toContain('thing: every endpoint failed')
    // 3 rounds × 3 endpoints, with backoff doubling between rounds
    expect(calls).toHaveLength(9)
    expect(sleep.mock.calls).toEqual([[100], [200]])
  })

  it('times out a hung endpoint and moves on', async () => {
    const hung = (signal: AbortSignal | null | undefined) =>
      new Promise<Response>((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    let n = 0
    const fetch = ((input: string, init?: RequestInit) => {
      n++
      return input.startsWith(REST) ? hung(init?.signal) : Promise.resolve(rpcResult({ v: 'a' }))
    }) as typeof globalThis.fetch
    const t = createTransport(endpoints, { fetch, timeoutMs: 20 })
    await expect(t.run('x', call)).resolves.toBe(`rpc:${RPC_A}:a`)
    expect(n).toBe(2)
  })

  it('treats a 200 that is not JSON as a broken endpoint', async () => {
    const { fetch } = mockFetch(({ url }) => (url.origin === REST ? new Response('<!doctype html>') : rpcResult({ v: 'a' })))
    const t = createTransport(endpoints, { fetch })
    await expect(t.run('x', call)).resolves.toBe(`rpc:${RPC_A}:a`)
  })

  it('network errors (fetch throws) fall through too', async () => {
    const { fetch } = mockFetch(({ url }) => {
      if (url.origin !== RPC_B) throw new TypeError('Failed to fetch')
      return rpcResult({ v: 'b' })
    })
    const t = createTransport(endpoints, { fetch })
    await expect(t.run('x', call)).resolves.toBe(`rpc:${RPC_B}:b`)
  })
})
