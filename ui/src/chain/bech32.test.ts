import { fromBech32, toBech32 } from '@cosmjs/encoding'
import { describe, expect, it } from 'vitest'
import { DEPLOYMENTS } from '../config/deployments'
import { decodeBech32 } from './bech32'

const ADDRESSES = [
  DEPLOYMENTS['reece-test'].hub.escrow ?? '',
  DEPLOYMENTS['reece-test'].hub.cw721,
  DEPLOYMENTS.badkids.hub.cw721,
  'cosmos1reece3m8g4m3d0qrpj93rnnseudnpzhrey64rr',
  'cosmos1q8m9275lcn5suv6c0k3v0mq3x639zqcq363fxl',
  'COSMOS1REECE3M8G4M3D0QRPJ93RNNSEUDNPZHREY64RR',
]

/** Deterministic bytes, so failures reproduce. */
function bytes(seed: number, n: number): Uint8Array {
  let x = seed * 2654435761
  return Uint8Array.from({ length: n }, () => {
    x = (x * 1103515245 + 12345) >>> 0
    return x >>> 24
  })
}

/** What cosmjs says, as something toEqual can compare. */
function cosmjs(address: string): { prefix: string; data: number[] } | 'throws' {
  try {
    const { prefix, data } = fromBech32(address, 90)
    return { prefix, data: [...data] }
  } catch {
    return 'throws'
  }
}

function ours(address: string): { prefix: string; data: number[] } | 'throws' {
  try {
    const { prefix, data } = decodeBech32(address)
    return { prefix, data: [...data] }
  } catch {
    return 'throws'
  }
}

describe('decodeBech32', () => {
  it.each(ADDRESSES)('matches cosmjs for %s', (address) => {
    expect(ours(address)).toEqual(cosmjs(address))
    expect(ours(address)).not.toBe('throws')
  })

  it('decodes a 32-byte contract and a 20-byte account', () => {
    expect(decodeBech32(ADDRESSES[0] ?? '').data).toHaveLength(32)
    expect(decodeBech32('cosmos1reece3m8g4m3d0qrpj93rnnseudnpzhrey64rr').data).toHaveLength(20)
  })

  it('round-trips random 20- and 32-byte addresses encoded by cosmjs', () => {
    for (let i = 0; i < 200; i++) {
      const data = bytes(i, i % 2 ? 20 : 32)
      const address = toBech32(i % 3 ? 'cosmos' : 'cosmosvaloper', data)
      expect([...decodeBech32(address).data]).toEqual([...data])
    }
  })

  it('agrees with cosmjs on every one-character typo', () => {
    const address = 'cosmos1reece3m8g4m3d0qrpj93rnnseudnpzhrey64rr'
    for (let i = 0; i < address.length; i++) {
      for (const c of ['q', 'p', 'z', '1', 'b', 'Q']) {
        const typo = address.slice(0, i) + c + address.slice(i + 1)
        expect([typo, ours(typo)]).toEqual([typo, cosmjs(typo)])
      }
    }
  })

  it.each([
    ['a bad checksum', 'cosmos1reece3m8g4m3d0qrpj93rnnseudnpzhrey64rq'],
    ['mixed case', 'cosmos1Reece3m8g4m3d0qrpj93rnnseudnpzhrey64rr'],
    ['no separator', 'cosmosreece'],
    ['junk', 'not an address'],
    ['too long for the limit', `cosmos1${'q'.repeat(90)}`],
    ['an empty prefix', '1qzzfhee'],
    ['a bad character', 'cosmos1reece3m8g4m3d0qrpj93rnnseudnpzhrey64rb'],
  ])('throws on %s', (_, address) => {
    expect(() => decodeBech32(address)).toThrow()
  })

  // BIP-173's own vectors
  it.each(['A12UEL5L', 'a12uel5l', 'abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw', '?1ezyfcl'])('accepts BIP-173 valid %s', (s) => {
    expect(() => decodeBech32(s)).not.toThrow()
  })

  it.each(['pzry9x0s0muk', '1pzry9x0s0muk', 'x1b4n0q5v', 'li1dgmt3', 'A1G7SGD8', '10a06t8', '1qzzfhee', 'de1lg7wt\xff'])(
    'rejects BIP-173 invalid %s',
    (s) => {
      expect(() => decodeBech32(s)).toThrow()
    },
  )
})
