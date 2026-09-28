import { describe, expect, it } from 'vitest'
import { MessageReader, MessageWriter } from './wire'

describe('wire', () => {
  it('round-trips bytes, string, uint64, enum and nested messages', () => {
    const inner = new MessageWriter().bytes32(1, new Uint8Array([9, 8, 7])).finish()
    const bytes = new MessageWriter()
      .bytes32(1, new Uint8Array([1, 2, 3]))
      .string(2, 'hello')
      .uint64(3, 123456789012345n)
      .enum(4, 3)
      .message(5, inner)
      .repeatedBytes(6, [new Uint8Array([1]), new Uint8Array([2])])
      .finish()

    const r = new MessageReader(bytes)
    expect(r.bytes(1)).toEqual(new Uint8Array([1, 2, 3]))
    expect(r.string(2)).toBe('hello')
    expect(r.uint64(3)).toBe(123456789012345n)
    expect(r.enumValue(4)).toBe(3)
    expect(r.message(5)?.bytes(1)).toEqual(new Uint8Array([9, 8, 7]))
    expect(r.repeatedBytes(6)).toEqual([new Uint8Array([1]), new Uint8Array([2])])
    expect(r.has(1)).toBe(true)
    expect(r.has(99)).toBe(false)
  })

  it('tags field 1 wire type 2 as 0x0a, the standard tag byte hub/prove.ts relies on for MerkleProof framing', () => {
    const bytes = new MessageWriter().bytes32(1, new Uint8Array([0xaa])).finish()
    expect(bytes[0]).toBe(0x0a)
  })

  it('encodes a uint64 that needs multiple varint bytes (>127) and reads it back', () => {
    const bytes = new MessageWriter().uint64(7, 300n).finish()
    // field 7, wiretype 0 -> tag = (7<<3)|0 = 56 = 0x38, fits one byte; 300 needs two varint bytes.
    expect(bytes[0]).toBe(0x38)
    expect(new MessageReader(bytes).uint64(7)).toBe(300n)
  })

  it('leaves an unset optional field undefined rather than defaulting to zero/empty', () => {
    const bytes = new MessageWriter().uint64(1, 5n).finish()
    const r = new MessageReader(bytes)
    expect(r.string(2)).toBeUndefined()
    expect(r.bytes(3)).toBeUndefined()
    expect(r.message(4)).toBeUndefined()
  })
})
