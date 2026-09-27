import { describe, expect, it } from 'vitest'
import { aboutMinutes, formatFee, kidList, shortAddress, shortHash, timeAgo } from './format'

describe('format', () => {
  it('shortens addresses and hashes', () => {
    expect(shortAddress('0x8f3a41b7e2D09C6A5E1f7b3C2d9A0e4f6b8Cc21d')).toBe('0x8f3a…c21d')
    expect(shortAddress('cosmos1q8m9275lcn5suv6c0k3v0mq3x639zqcq363fxl')).toBe('cosmos1q8m…3fxl')
    expect(shortHash('0C72F725AB12CD34E2F5')).toBe('0C72F7…E2F5')
    expect(shortHash(`0x${'ab'.repeat(32)}`)).toBe('0xababab…abab')
  })

  it('lists kids like a person would', () => {
    expect(kidList([9176])).toBe('#9176')
    expect(kidList([9176, 6413])).toBe('#9176 & #6413')
    expect(kidList([1, 2, 3])).toBe('#1, #2 & #3')
  })

  it.each([
    [{ amount: '1750', denom: 'uatom' }, '0.00175 ATOM'],
    [{ amount: '1000000', denom: 'uatom' }, '1 ATOM'],
    [{ amount: '0', denom: 'uatom' }, '0 ATOM'],
    [{ amount: '5', denom: 'ibc/ABC' }, '5 ibc/ABC'],
  ])('formatFee(%j) = %s', (fee, text) => {
    expect(formatFee(fee)).toBe(text)
  })

  it('rounds waits to words', () => {
    expect(aboutMinutes(0.4)).toBe('less than a minute')
    expect(aboutMinutes(10)).toBe('about 10 min')
    expect(aboutMinutes(125)).toBe('about 2 hours')
    expect(aboutMinutes(Number.NaN)).toBe('less than a minute')
  })

  it('says how long ago', () => {
    const now = new Date('2026-09-27T17:00:00Z')
    expect(timeAgo(new Date('2026-09-27T16:59:30Z'), now)).toBe('just now')
    expect(timeAgo(new Date('2026-09-27T16:38:00Z'), now)).toBe('22 min ago')
    expect(timeAgo(new Date('2026-09-27T15:30:00Z'), now)).toBe('1 hour ago')
  })
})
