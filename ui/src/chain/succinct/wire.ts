// Minimal hand-rolled protobuf wire encode/decode for the handful of Succinct prover-network messages the
// proof page needs. No .proto source is published with the sp1-sdk crate — every field number and type here
// was read directly off the prost-generated Rust in sp1-sdk 6.1.0's network/proto/{artifact,auction/types}.rs
// (in ~/.cargo/registry), not guessed. Only what's needed: varint, length-delimited (bytes/string/submessage),
// and the small set of message shapes RequestProof/GetProofRequestStatus/GetNonce/GetProgram/
// GetProofRequestParams/GetProversByUptime/CreateArtifact actually use — no full protobuf library for this.

/** n is always a small non-negative integer here: field tags, enum values, length prefixes. */
function pushVarint(out: number[], n: number): void {
  let v = n
  do {
    let byte = v & 0x7f
    v = Math.floor(v / 128)
    if (v > 0) byte |= 0x80
    out.push(byte)
  } while (v > 0)
}

function pushVarintBig(out: number[], n: bigint): void {
  let v = n
  do {
    let byte = Number(v & 0x7fn)
    v >>= 7n
    if (v > 0n) byte |= 0x80
    out.push(byte)
  } while (v > 0n)
}

function pushTag(out: number[], field: number, wireType: 0 | 2): void {
  pushVarint(out, (field << 3) | wireType)
}

function pushBytes(out: number[], field: number, bytes: Uint8Array): void {
  pushTag(out, field, 2)
  pushVarint(out, bytes.length)
  for (const b of bytes) out.push(b)
}

function pushString(out: number[], field: number, s: string): void {
  pushBytes(out, field, new TextEncoder().encode(s))
}

// proto3 omits default values, and the server re-encodes the body canonically before recovering the signer
// from the signature, so a body with explicit zeros recovers to a random address.
function pushUint64(out: number[], field: number, n: bigint): void {
  if (n === 0n) return
  pushTag(out, field, 0)
  pushVarintBig(out, n)
}

function pushEnum(out: number[], field: number, n: number): void {
  if (n === 0) return
  pushTag(out, field, 0)
  pushVarint(out, n)
}

function pushMessage(out: number[], field: number, bytes: Uint8Array): void {
  pushBytes(out, field, bytes)
}

/** A tiny protobuf message builder: call the push* helpers in any order, then `finish()`. */
export class MessageWriter {
  private readonly bytes: number[] = []
  bytes32(field: number, v: Uint8Array): this {
    pushBytes(this.bytes, field, v)
    return this
  }
  string(field: number, v: string): this {
    pushString(this.bytes, field, v)
    return this
  }
  uint64(field: number, v: bigint): this {
    pushUint64(this.bytes, field, v)
    return this
  }
  enum(field: number, v: number): this {
    pushEnum(this.bytes, field, v)
    return this
  }
  message(field: number, v: Uint8Array): this {
    pushMessage(this.bytes, field, v)
    return this
  }
  /** repeated bytes: one entry per call. */
  repeatedBytes(field: number, values: readonly Uint8Array[]): this {
    for (const v of values) pushBytes(this.bytes, field, v)
    return this
  }
  finish(): Uint8Array {
    return new Uint8Array(this.bytes)
  }
}

interface RawField {
  wireType: number
  bytes?: Uint8Array
  varint?: bigint
}

/** Decodes into field-number -> occurrences (in wire order), for the small set of types this file needs. */
export class MessageReader {
  private readonly fields = new Map<number, RawField[]>()

  constructor(data: Uint8Array) {
    let i = 0
    const readVarint = (): bigint => {
      let result = 0n
      let shift = 0n
      for (;;) {
        const byte = data[i]
        if (byte === undefined) throw new Error('protobuf: truncated varint')
        i++
        result |= BigInt(byte & 0x7f) << shift
        if ((byte & 0x80) === 0) return result
        shift += 7n
      }
    }
    while (i < data.length) {
      const tag = readVarint()
      const field = Number(tag >> 3n)
      const wireType = Number(tag & 0x7n)
      let entry: RawField
      if (wireType === 0) {
        entry = { wireType, varint: readVarint() }
      } else if (wireType === 2) {
        const len = Number(readVarint())
        entry = { wireType, bytes: data.slice(i, i + len) }
        i += len
      } else {
        throw new Error(`protobuf: unsupported wire type ${wireType} (field ${field})`)
      }
      const list = this.fields.get(field)
      if (list) list.push(entry)
      else this.fields.set(field, [entry])
    }
  }

  private first(field: number): RawField | undefined {
    return this.fields.get(field)?.[0]
  }

  bytes(field: number): Uint8Array | undefined {
    return this.first(field)?.bytes
  }

  string(field: number): string | undefined {
    const b = this.bytes(field)
    return b === undefined ? undefined : new TextDecoder().decode(b)
  }

  uint64(field: number): bigint | undefined {
    return this.first(field)?.varint
  }

  enumValue(field: number): number | undefined {
    const v = this.uint64(field)
    return v === undefined ? undefined : Number(v)
  }

  message(field: number): MessageReader | undefined {
    const b = this.bytes(field)
    return b === undefined ? undefined : new MessageReader(b)
  }

  repeatedBytes(field: number): Uint8Array[] {
    return (this.fields.get(field) ?? []).map((f) => f.bytes ?? new Uint8Array())
  }

  has(field: number): boolean {
    return this.fields.has(field)
  }
}
