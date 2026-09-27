import { fromBech32 } from '@cosmjs/encoding'
import { bytesToHex, type Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import { DEPLOYMENTS } from '../config/deployments'
import { checkConfig, describeConfigProblem, escrowBytes32 } from './sanity'

const live = DEPLOYMENTS['reece-test']
const escrow = live.hub.escrow ?? ''
const good = bytesToHex(fromBech32(escrow).data)

describe('checkConfig', () => {
  it('passes when both contracts agree with the deployment', () => {
    expect(checkConfig(live, live.hub.cw721, good)).toEqual({ ok: true, status: 'ok', problems: [] })
  })

  it('ignores hex case', () => {
    expect(checkConfig(live, live.hub.cw721, good.toUpperCase().replace('0X', '0x') as Hex).ok).toBe(true)
  })

  it('flags an escrow that accepts another collection', () => {
    const other = DEPLOYMENTS.badkids.hub.cw721
    const result = checkConfig(live, other, good)
    expect(result).toMatchObject({ ok: false, status: 'mismatch' })
    expect(result.problems).toEqual([
      { code: 'EscrowCollection', expected: live.hub.cw721, actual: other, message: expect.stringContaining(other) as string },
    ])
  })

  it('flags a bridge that trusts another escrow', () => {
    const other: Hex = `0x${'11'.repeat(32)}`
    const result = checkConfig(live, live.hub.cw721, other)
    expect(result).toMatchObject({ ok: false, status: 'mismatch', problems: [{ code: 'BridgeEscrow', expected: good, actual: other }] })
  })

  it.each([
    ['20 bytes', `0x${good.slice(2, 42)}`],
    ['33 bytes with our escrow as a prefix', `${good}00`],
    ['not hex', `0x${'zz'.repeat(32)}`],
    ['empty', '0x'],
  ])('flags a bridge escrow that is %s', (_name, actual) => {
    const result = checkConfig(live, live.hub.cw721, actual as Hex)
    expect(result.ok).toBe(false)
    expect(result.problems[0]).toMatchObject({ code: 'BridgeEscrow', actual })
  })

  it('reports both problems at once', () => {
    const result = checkConfig(live, 'cosmos1other', `0x${'11'.repeat(32)}`)
    expect(result.problems.map((p) => p.code)).toEqual(['EscrowCollection', 'BridgeEscrow'])
    expect(result.problems.every((p) => p.message)).toBe(true)
  })

  it('treats a missing escrow or bridge as not live', () => {
    expect(checkConfig(DEPLOYMENTS.badkids, DEPLOYMENTS.badkids.hub.cw721, good)).toMatchObject({
      ok: false,
      status: 'not-live',
      problems: [{ code: 'NotLive' }],
    })
    const noBridge = { ...live, eth: { ...live.eth, bridge: null } }
    expect(checkConfig(noBridge, live.hub.cw721, good).status).toBe('not-live')
  })

  it('refuses a configured escrow that is not a 32-byte address', () => {
    const wallet = { ...live, hub: { ...live.hub, escrow: 'cosmos1q8m9275lcn5suv6c0k3v0mq3x639zqcq363fxl' } }
    const result = checkConfig(wallet, live.hub.cw721, good)
    expect(result).toMatchObject({ ok: false, problems: [{ code: 'BridgeEscrow', expected: '0x' }] })
    expect(describeConfigProblem(result.problems[0]!)).toMatch(/isn't a valid 32-byte/)
  })
})

describe('escrowBytes32', () => {
  it('decodes a contract address and rejects anything else', () => {
    expect(escrowBytes32(escrow)).toBe(good)
    expect(escrowBytes32('cosmos1q8m9275lcn5suv6c0k3v0mq3x639zqcq363fxl')).toBeNull()
    expect(escrowBytes32('not bech32')).toBeNull()
  })
})
