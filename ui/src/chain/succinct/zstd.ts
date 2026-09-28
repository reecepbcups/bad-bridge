// zstd(level 3) compression for the bincode-encoded SP1Stdin before upload, matching the Rust batcher's
// `zstd::encode_all(_, level=3)`. Needs an encoder, not just a decoder (fzstd and friends are decode-only) —
// @oneidentity/zstd-js wraps the official zstd WASM build for the browser.

import { ZstdInit, type ZstdCodec } from '@oneidentity/zstd-js'

const ZSTD_LEVEL = 3

let codec: Promise<ZstdCodec> | undefined

function zstd(): Promise<ZstdCodec> {
  codec ??= ZstdInit()
  return codec
}

/** zstd-compresses `data` at level 3, matching the Rust batcher's stdin upload. */
export async function zstdCompress(data: Uint8Array): Promise<Uint8Array> {
  const { ZstdSimple } = await zstd()
  // ZstdSimple.compress returns a view into the WASM module's own heap: copy it out before returning,
  // since a later compress/decompress call (heap growth or reuse) can invalidate that view.
  return Uint8Array.from(ZstdSimple.compress(data, ZSTD_LEVEL))
}
