// A minimal bincode 1.x reader for the one shape the proof page decodes: ProofFromNetwork's Groth16 variant
// (see succinct/proof.ts). bincode 1.x's default config is little-endian, fixint (u32 enum discriminants,
// u64 Vec/String length prefixes) — the same config hub/stdin.ts's encoder targets on the request side.

export class BincodeReader {
  private offset = 0
  constructor(private readonly data: Uint8Array) {}

  private view(size: number): DataView {
    if (this.offset + size > this.data.length) throw new Error('bincode: unexpected end of data')
    return new DataView(this.data.buffer, this.data.byteOffset + this.offset, size)
  }

  /** A bincode enum discriminant: u32 little-endian. */
  u32(): number {
    const n = this.view(4).getUint32(0, true)
    this.offset += 4
    return n
  }

  u64(): bigint {
    const n = this.view(8).getBigUint64(0, true)
    this.offset += 8
    return n
  }

  /** A fixed-size byte array (no length prefix — the size is part of the Rust type, e.g. `[u8; 32]`). */
  bytes(n: number): Uint8Array {
    if (this.offset + n > this.data.length) throw new Error('bincode: unexpected end of data')
    const out = this.data.slice(this.offset, this.offset + n)
    this.offset += n
    return out
  }

  /** A bincode `Vec<u8>`: u64 LE length, then that many raw bytes. */
  byteVec(): Uint8Array {
    return this.bytes(Number(this.u64()))
  }

  /** A bincode `String`: u64 LE length, then that many utf8 bytes. */
  string(): string {
    return new TextDecoder().decode(this.byteVec())
  }
}
