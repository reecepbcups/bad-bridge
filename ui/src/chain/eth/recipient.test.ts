import { describe, expect, it } from 'vitest'
import { checkRecipient } from './recipient'

const CHECKSUMMED = '0xD2C392084761cb6E44c544B6f39dcc001fDe9775'
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

describe('checkRecipient', () => {
  it('accepts checksummed, all-lower and all-upper addresses', () => {
    for (const input of [CHECKSUMMED, CHECKSUMMED.toLowerCase(), `0x${CHECKSUMMED.slice(2).toUpperCase()}`, `  ${CHECKSUMMED} `]) {
      expect(checkRecipient(input)).toEqual({ ok: true, address: CHECKSUMMED, isConnected: false })
    }
  })

  it('rejects bad input', () => {
    expect(checkRecipient('0x1234')).toEqual({ ok: false, reason: 'format' })
    expect(checkRecipient('d2c392084761cb6e44c544b6f39dcc001fde9775')).toEqual({ ok: false, reason: 'format' })
    expect(checkRecipient(`0x${'0'.repeat(40)}`)).toEqual({ ok: false, reason: 'zero' })
    expect(checkRecipient('0xd2C392084761cb6E44c544B6f39dcc001fDe9775')).toEqual({ ok: false, reason: 'checksum' })
  })

  it('checks the format strictly', () => {
    for (const input of [
      '',
      '0x',
      `${CHECKSUMMED}0`, // 41 hex chars
      CHECKSUMMED.slice(0, -1), // 39
      `0X${CHECKSUMMED.slice(2)}`, // uppercase prefix
      `0x${CHECKSUMMED.slice(2, -1)}g`, // not hex
      'vitalik.eth',
      `0x ${CHECKSUMMED.slice(2)}`,
    ]) {
      expect(checkRecipient(input), input).toEqual({ ok: false, reason: 'format' })
    }
  })

  it('rejects the zero address in any case, before checksum', () => {
    expect(checkRecipient(`  0x${'0'.repeat(40)}  `)).toEqual({ ok: false, reason: 'zero' })
  })

  it('only enforces EIP-55 on mixed case', () => {
    // one flipped letter in an otherwise valid checksum
    expect(checkRecipient('0xD2C392084761cb6E44c544B6f39dcc001fDe9775'.replace('D2C', 'd2C'))).toEqual({ ok: false, reason: 'checksum' })
    expect(checkRecipient(OTHER.replace('C51', 'c51'))).toEqual({ ok: false, reason: 'checksum' })
    // all-lower and all-upper bodies carry no checksum, so they pass and come back checksummed
    expect(checkRecipient(OTHER.toLowerCase())).toMatchObject({ ok: true, address: OTHER })
    expect(checkRecipient(`0x${OTHER.slice(2).toUpperCase()}`)).toMatchObject({ ok: true, address: OTHER })
  })

  it('refuses precompiles, system addresses and well-known burn addresses', () => {
    for (const input of [
      '0x0000000000000000000000000000000000000001', // ecrecover
      '0x0000000000000000000000000000000000000100', // p256verify
      '0x000000000000000000000000000000000000ffff',
      '0x000000000000000000000000000000000000FFFF',
      '0x000000000000000000000000000000000000dEaD',
      '0x000000000000000000000000000000000000dead',
    ]) {
      expect(checkRecipient(input), input).toEqual({ ok: false, reason: 'burn' })
    }
    // just past the reserved range is an ordinary address
    expect(checkRecipient('0x0000000000000000000000000000000000010000')).toMatchObject({ ok: true })
    // a checksum typo is still reported as a typo first
    expect(checkRecipient('0x000000000000000000000000000000000000DeaD')).toEqual({ ok: false, reason: 'checksum' })
  })

  it('knows the connected wallet whatever the case', () => {
    expect(checkRecipient(CHECKSUMMED, CHECKSUMMED.toLowerCase() as `0x${string}`)).toMatchObject({ ok: true, isConnected: true })
    expect(checkRecipient(CHECKSUMMED.toLowerCase(), CHECKSUMMED)).toMatchObject({ ok: true, isConnected: true })
  })

  it('says when it is not the connected wallet, or when none is connected', () => {
    expect(checkRecipient(CHECKSUMMED, OTHER)).toEqual({ ok: true, address: CHECKSUMMED, isConnected: false })
    expect(checkRecipient(CHECKSUMMED, undefined)).toEqual({ ok: true, address: CHECKSUMMED, isConnected: false })
  })
})
