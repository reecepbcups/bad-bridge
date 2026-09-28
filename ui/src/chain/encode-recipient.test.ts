import { toBase64 } from '@cosmjs/encoding'
import { getAddress, toHex } from 'viem'
import { describe, expect, it } from 'vitest'
import { base64, recipientMsg } from './encode-recipient'
import { encodeRecipient } from './hub/encode'

describe('recipientMsg', () => {
  it('matches the golden vector from the real send tx', () => {
    expect(recipientMsg('0xd2c392084761cb6e44c544b6f39dcc001fde9775')).toBe('0sOSCEdhy25ExUS2853MAB/el3U=')
    expect(recipientMsg(getAddress('0xd2c392084761cb6e44c544b6f39dcc001fde9775'))).toBe('0sOSCEdhy25ExUS2853MAB/el3U=')
  })

  it('matches the Hub encoder for any address', () => {
    for (let n = 0; n < 200; n++) {
      const bytes = crypto.getRandomValues(new Uint8Array(20))
      if (bytes.every((b) => b === 0)) continue
      const address = getAddress(toHex(bytes))
      expect(recipientMsg(address)).toBe(encodeRecipient(address))
    }
  })

  it('is null for anything but 0x + 40 hex', () => {
    for (const bad of ['', '0x', '0xd2c392084761cb6e44c544b6f39dcc001fde97', 'd2c392084761cb6e44c544b6f39dcc001fde9775aa', '0xzz'.padEnd(42, '0')]) {
      expect(recipientMsg(bad), bad).toBeNull()
    }
  })
})

describe('base64', () => {
  it('pads like the standard encoder at every length', () => {
    for (let len = 0; len < 8; len++) {
      const bytes = crypto.getRandomValues(new Uint8Array(len))
      expect(base64(bytes)).toBe(toBase64(bytes))
    }
  })
})
