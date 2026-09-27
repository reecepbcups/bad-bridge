import { describe, expect, it } from 'vitest'
import { checkRecipient } from './recipient'

const CHECKSUMMED = '0xD2C392084761cb6E44c544B6f39dcc001fDe9775'

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

  it('knows the connected wallet whatever the case', () => {
    expect(checkRecipient(CHECKSUMMED, CHECKSUMMED.toLowerCase() as `0x${string}`)).toMatchObject({ ok: true, isConnected: true })
  })
})
