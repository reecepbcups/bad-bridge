import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import { getProveBalance, requestProofWithNonceRetry } from './client'

// Captured live (this session): a real grpc-web GetBalance call for a real zero-balance address returned
// this exact frame — a 3-byte data frame (field 1 string "0") + a grpc-status:0 trailer.
const LIVE_ZERO_BALANCE_RESPONSE = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x03, 0x0a, 0x01, 0x30, 0x80, 0x00, 0x00, 0x00, 0x0f, 0x67, 0x72, 0x70, 0x63, 0x2d, 0x73, 0x74, 0x61, 0x74, 0x75, 0x73,
  0x3a, 0x30, 0x0d, 0x0a,
])

function fakeFetch(body: Uint8Array): typeof fetch {
  return () => Promise.resolve(new Response(new Uint8Array(body).buffer, { status: 200, headers: { 'content-type': 'application/grpc-web+proto' } }))
}

describe('getProveBalance', () => {
  it('parses the live zero-balance capture as 0n', async () => {
    const balance = await getProveBalance('0xD2C392084761cb6E44c544B6f39dcc001fDe9775', fakeFetch(LIVE_ZERO_BALANCE_RESPONSE))
    expect(balance).toBe(0n)
  })

  it('parses a non-zero amount', async () => {
    const message = new Uint8Array([0x0a, 0x02, 0x35, 0x30]) // field 1, len 2, "50"
    const frame = new Uint8Array(5 + message.length)
    new DataView(frame.buffer).setUint32(1, message.length, false)
    frame.set(message, 5)
    const trailer = new TextEncoder().encode('grpc-status:0\r\n')
    const trailerFrame = new Uint8Array(5 + trailer.length)
    trailerFrame[0] = 0x80
    new DataView(trailerFrame.buffer).setUint32(1, trailer.length, false)
    trailerFrame.set(trailer, 5)
    const body = new Uint8Array([...frame, ...trailerFrame])

    const balance = await getProveBalance('0xD2C392084761cb6E44c544B6f39dcc001fDe9775', fakeFetch(body))
    expect(balance).toBe(50n)
  })
})

function dataFrameResponse(message: Uint8Array): Response {
  const frame = new Uint8Array(5 + message.length)
  new DataView(frame.buffer).setUint32(1, message.length, false)
  frame.set(message, 5)
  const trailer = new TextEncoder().encode('grpc-status:0\r\n')
  const trailerFrame = new Uint8Array(5 + trailer.length)
  trailerFrame[0] = 0x80
  new DataView(trailerFrame.buffer).setUint32(1, trailer.length, false)
  trailerFrame.set(trailer, 5)
  const body = new Uint8Array([...frame, ...trailerFrame])
  return new Response(body.buffer, { status: 200, headers: { 'content-type': 'application/grpc-web+proto' } })
}

/** RequestProofResponse { body: RequestProofResponseBody { request_id: bytes = 1 } (field 2) }. */
function requestProofSuccessMessage(requestId: Uint8Array): Uint8Array {
  const inner = new Uint8Array(2 + requestId.length)
  inner[0] = 0x0a // field 1, LEN
  inner[1] = requestId.length
  inner.set(requestId, 2)
  const outer = new Uint8Array(2 + inner.length)
  outer[0] = 0x12 // field 2, LEN
  outer[1] = inner.length
  outer.set(inner, 2)
  return outer
}

describe('requestProofWithNonceRetry', () => {
  it('retries once with the nonce the rejection itself reports as expected — captured live this session: '
    + 'Succinct answered GetNonce with 3 for a fresh address, then rejected RequestProof(nonce=3) as invalid, '
    + 'expecting 0', async () => {
    const wallet = { account: privateKeyToAccount('0xad766d989fce9c4c94377caaa0b4ce0a2794e39987a01fdb9cd01ed915f4264d') } as Parameters<
      typeof requestProofWithNonceRetry
    >[0]
    const requestId = new Uint8Array([0xaa, 0xbb])
    const calls: number[] = []

    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(calls.length)
      void init
      if (calls.length === 1) {
        // live-captured grpc-message text, as a Trailers-Only header response (see grpcweb.ts)
        return Promise.resolve(
          new Response(null, {
            status: 200,
            headers: {
              'content-type': 'application/grpc-web+proto',
              'grpc-status': '10',
              'grpc-message': encodeURIComponent(
                'failed nonce verification: invalid nonce for sender 0xa5516F117F6d19A2836d17eB8e4aA1f6A8a208a0 expected 0, got 3',
              ),
            },
          }),
        )
      }
      return Promise.resolve(dataFrameResponse(requestProofSuccessMessage(requestId)))
    }) as typeof fetch

    const buildBody = (nonce: bigint) => new Uint8Array([Number(nonce)]) // stand-in body; only its identity matters here
    const result = await requestProofWithNonceRetry(wallet, buildBody, 3n, fetchImpl)

    expect(calls).toHaveLength(2)
    expect(result).toEqual(requestId)
  })

  it('does not retry (and rethrows) an unrelated error', async () => {
    const wallet = { account: privateKeyToAccount('0xad766d989fce9c4c94377caaa0b4ce0a2794e39987a01fdb9cd01ed915f4264d') } as Parameters<
      typeof requestProofWithNonceRetry
    >[0]
    let calls = 0
    const fetchImpl = (() => {
      calls++
      return Promise.resolve(
        new Response(null, {
          status: 200,
          headers: { 'content-type': 'application/grpc-web+proto', 'grpc-status': '8', 'grpc-message': 'insufficient balance' },
        }),
      )
    }) as typeof fetch

    await expect(requestProofWithNonceRetry(wallet, () => new Uint8Array(), 0n, fetchImpl)).rejects.toThrow(/insufficient balance/)
    expect(calls).toBe(1)
  })
})
