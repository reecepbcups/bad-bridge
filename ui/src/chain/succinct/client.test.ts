import { describe, expect, it } from 'vitest'
import { getProveBalance } from './client'

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
