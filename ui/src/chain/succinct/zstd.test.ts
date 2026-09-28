import { ZstdInit } from '@oneidentity/zstd-js'
import { describe, expect, it } from 'vitest'
import { zstdCompress } from './zstd'

describe('zstdCompress', () => {
  it('produces bytes zstd can decompress back to the original', async () => {
    const original = new TextEncoder().encode('hello from the bad bridge proof page, '.repeat(20))
    const compressed = await zstdCompress(original)
    expect(compressed.length).toBeGreaterThan(0)
    expect(compressed.length).toBeLessThan(original.length)

    const { ZstdSimple } = await ZstdInit()
    const roundTripped = ZstdSimple.decompress(compressed)
    // ZstdSimple.decompress returns a view into the WASM module's own heap, not a plain Uint8Array, so
    // compare contents rather than relying on toEqual's structural/prototype check.
    expect(Array.from(roundTripped)).toEqual(Array.from(original))
  })
})
