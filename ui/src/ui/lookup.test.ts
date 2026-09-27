import { describe, expect, it } from 'vitest'
import { DEMO_ETH, DEMO_HUB } from '../chain/demo/seed'
import { parseLookup, type Lookup } from './lookup'

describe('parseLookup', () => {
  const cases: [input: string, kind: Lookup['kind'], value?: unknown][] = [
    [DEMO_ETH, 'eth', DEMO_ETH],
    [DEMO_ETH.toLowerCase(), 'eth', DEMO_ETH],
    [`  ${DEMO_ETH}  `, 'eth', DEMO_ETH],
    [DEMO_HUB, 'hub', DEMO_HUB],
    [DEMO_HUB.toUpperCase(), 'hub', DEMO_HUB],
    ['#1234', 'kid', 1234],
    ['1234', 'kid', 1234],
    ['# 7', 'kid', 7],
    ['#0', 'kid', 0],
    ['#007', 'bad'],
    ['#4294967296', 'bad'],
    ['0x1234', 'bad'],
    [`0x${'0'.repeat(40)}`, 'bad'],
    ['0x8f3a41b7e2D09C6A5E1f7b3C2d9A0e4f6b8Cc21D', 'bad'], // wrong checksum
    ['cosmos1q8m9275lcn5suv6c0k3v0mq3x639zqcq363fxx', 'bad'], // bad bech32 checksum
    ['osmo1q8m9275lcn5suv6c0k3v0mq3x639zqcq363fxl', 'bad'],
    ['', 'bad'],
    ['hello', 'bad'],
  ]
  it.each(cases)('%s → %s', (input, kind, value) => {
    const got = parseLookup(input)
    expect(got.kind).toBe(kind)
    if (got.kind === 'eth' || got.kind === 'hub') expect(got.address).toBe(value)
    if (got.kind === 'kid') expect(got.id).toBe(value)
    if (got.kind === 'bad') expect(got.message.length).toBeGreaterThan(10)
  })
})
