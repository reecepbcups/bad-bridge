import { describe, expect, it } from 'vitest'
import { grpcWebCall } from './grpcweb'

// Captured live (this session) from a real browser fetch to rpc.mainnet.succinct.xyz's GetNonce with a dummy
// 20-byte zero address: an empty data frame (nonce defaults to 0, so proto3 omits the field) followed by a
// trailer frame carrying "grpc-status:0\r\n". Locks the frame parser to what the live server actually sends.
const LIVE_OK_RESPONSE = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x0f, 0x67, 0x72, 0x70, 0x63, 0x2d, 0x73, 0x74, 0x61, 0x74, 0x75, 0x73, 0x3a, 0x30, 0x0d, 0x0a])

function fakeFetch(body: Uint8Array, status = 200): typeof fetch {
  return (async () => new Response(body, { status, headers: { 'content-type': 'application/grpc-web+proto' } })) as typeof fetch
}

describe('grpcWebCall', () => {
  it('parses the live server capture: empty data frame + grpc-status:0 trailer as success with empty body', async () => {
    const data = await grpcWebCall('/network.ProverNetwork/GetNonce', new Uint8Array(), fakeFetch(LIVE_OK_RESPONSE))
    expect(data.length).toBe(0)
  })

  it('returns the data frame bytes when the server answers with a non-empty message', async () => {
    const message = new Uint8Array([0x08, 0x2a]) // field 1 varint = 42, an arbitrary GetNonceResponse-shaped payload
    const trailer = new TextEncoder().encode('grpc-status:0\r\n')
    const dataFrame = new Uint8Array(5 + message.length)
    new DataView(dataFrame.buffer).setUint32(1, message.length, false)
    dataFrame.set(message, 5)
    const trailerFrame = new Uint8Array(5 + trailer.length)
    trailerFrame[0] = 0x80
    new DataView(trailerFrame.buffer).setUint32(1, trailer.length, false)
    trailerFrame.set(trailer, 5)
    const body = new Uint8Array([...dataFrame, ...trailerFrame])

    const data = await grpcWebCall('/network.ProverNetwork/GetNonce', new Uint8Array(), fakeFetch(body))
    expect(data).toEqual(message)
  })

  it('throws on a non-zero grpc-status trailer', async () => {
    const trailer = new TextEncoder().encode('grpc-status:3\r\ngrpc-message:bad request\r\n')
    const trailerFrame = new Uint8Array(5 + trailer.length)
    trailerFrame[0] = 0x80
    new DataView(trailerFrame.buffer).setUint32(1, trailer.length, false)
    trailerFrame.set(trailer, 5)

    await expect(grpcWebCall('/network.ProverNetwork/GetNonce', new Uint8Array(), fakeFetch(trailerFrame))).rejects.toThrow(/grpc-status 3/)
  })

  it('throws on a non-2xx HTTP status', async () => {
    await expect(grpcWebCall('/network.ProverNetwork/GetNonce', new Uint8Array(), fakeFetch(new Uint8Array(), 502))).rejects.toThrow(/HTTP 502/)
  })
})
