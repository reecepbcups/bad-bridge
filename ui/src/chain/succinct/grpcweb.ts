// grpc-web framing for calls to rpc.mainnet.succinct.xyz. Confirmed live (this session): the host answers a
// grpc-web+proto POST to network.ProverNetwork/GetNonce with a correctly-framed response and permissive CORS
// (access-control-allow-origin reflects the request Origin) — the Rust sp1-sdk client itself only shows native
// gRPC/HTTP2 (tonic, no tonic-web layer), so this was verified against the live server, not inferred from the SDK.

import { BridgeError } from '../types'

const SUCCINCT_MAINNET_RPC = 'https://rpc.mainnet.succinct.xyz'

function frame(message: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + message.length)
  // byte 0: compression flag (0 = uncompressed); bytes 1-4: big-endian message length
  new DataView(out.buffer).setUint32(1, message.length, false)
  out.set(message, 5)
  return out
}

interface Frame {
  /** High bit set marks a trailer frame (grpc-status, grpc-message as "k: v\r\n" lines) instead of a message. */
  isTrailer: boolean
  data: Uint8Array
}

function parseFrames(body: Uint8Array): Frame[] {
  const frames: Frame[] = []
  let i = 0
  while (i < body.length) {
    const flags = body[i]
    const view = new DataView(body.buffer, body.byteOffset + i + 1, 4)
    const len = view.getUint32(0, false)
    const start = i + 5
    frames.push({ isTrailer: ((flags ?? 0) & 0x80) !== 0, data: body.slice(start, start + len) })
    i = start + len
  }
  return frames
}

function parseTrailerStatus(trailer: Uint8Array): { code: number; message: string } {
  const text = new TextDecoder().decode(trailer)
  let code = 0
  let message = ''
  for (const line of text.split('\r\n')) {
    const [key, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    if (key === 'grpc-status') code = Number(value)
    else if (key === 'grpc-message') message = decodeURIComponent(value)
  }
  return { code, message }
}

/** One grpc-web unary call: `path` like "/network.ProverNetwork/GetNonce", `body` the protobuf request bytes. */
export async function grpcWebCall(path: string, body: Uint8Array, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  let res: Response
  try {
    res = await fetchImpl(`${SUCCINCT_MAINNET_RPC}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/grpc-web+proto', 'x-grpc-web': '1' },
      // Blob, not the Uint8Array directly: TS 6's Uint8Array<ArrayBufferLike> return types (from functions
      // typed to return plain `Uint8Array`) aren't assignable to BodyInit/BlobPart, which want the buffer
      // narrowed to a concrete ArrayBuffer — `new Uint8Array(bytes)` copies into a fresh one that satisfies it.
      body: new Blob([new Uint8Array(frame(body))]),
    })
  } catch (e) {
    throw new BridgeError('Network', `${path}: ${e instanceof Error ? e.message : String(e)}`, { cause: e })
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  if (!res.ok) throw new BridgeError('Network', `${path}: HTTP ${res.status}`)

  const frames = parseFrames(buf)
  const trailer = frames.find((f) => f.isTrailer)
  const { code, message } = trailer ? parseTrailerStatus(trailer.data) : { code: 0, message: '' }
  if (code !== 0) throw new BridgeError('Unknown', `${path}: grpc-status ${code}${message ? `: ${message}` : ''}`)

  const dataFrame = frames.find((f) => !f.isTrailer)
  return dataFrame?.data ?? new Uint8Array()
}
