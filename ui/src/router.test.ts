import { describe, expect, it } from 'vitest'
import { href, parseHash, type Route } from './router'

describe('parseHash', () => {
  const cases: [hash: string, route: Route][] = [
    ['', { name: 'bridge' }],
    ['#/', { name: 'bridge' }],
    ['#/kids', { name: 'kids' }],
    ['#/kids/', { name: 'kids' }],
    ['#/kids/0x8f3a41b7e2D09C6A5E1f7b3C2d9A0e4f6b8Cc21d', { name: 'kids', address: '0x8f3a41b7e2D09C6A5E1f7b3C2d9A0e4f6b8Cc21d' }],
    ['#/kids/cosmos1q8m9275lcn5suv6c0k3v0mq3x639zqcq363fxl', { name: 'kids', address: 'cosmos1q8m9275lcn5suv6c0k3v0mq3x639zqcq363fxl' }],
    ['#/kid/9254', { name: 'kid', id: 9254 }],
    ['#/kid/0', { name: 'kid', id: 0 }],
    ['#/kid/4294967295', { name: 'kid', id: 4294967295 }],
    ['#/about', { name: 'about' }],
    // same canonical-id rule as the escrow
    ['#/kid/07', { name: 'not-found', path: '/kid/07' }],
    ['#/kid/+7', { name: 'not-found', path: '/kid/+7' }],
    ['#/kid/4294967296', { name: 'not-found', path: '/kid/4294967296' }],
    ['#/kid', { name: 'not-found', path: '/kid' }],
    ['#/nope', { name: 'not-found', path: '/nope' }],
  ]
  it.each(cases)('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route)
  })
})

describe('href', () => {
  it('round-trips through parseHash', () => {
    const routes: Route[] = [{ name: 'bridge' }, { name: 'kids' }, { name: 'kids', address: '0xabc' }, { name: 'kid', id: 3 }, { name: 'about' }]
    for (const r of routes) expect(parseHash(href(r))).toEqual(r)
  })
})
