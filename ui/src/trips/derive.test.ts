import { describe, expect, it } from 'vitest'
import type { ClientStatus, EscrowRecord, KidEthStatus } from '../chain/types'
import { blocksToGo, deriveStage, isStuck, STUCK_AFTER_MS, type StageInput } from './derive'
import type { Stage } from './types'

const ALICE = '0x00000000000000000000000000000000000A11CE'
const BOB = '0x0000000000000000000000000000000000000B0B'
const HS = 1_000

const record: EscrowRecord = { tokenId: 7, recipient: ALICE }
const client = (latestHeight: number, frozen = false): ClientStatus => ({ latestHeight, frozen })
const eth = (proven: string | null, owner: string | null = null) => ({ proven, owner }) as KidEthStatus
const nothingOnEth = eth(null)

// One row per line of PLAN.md's state table, plus the edge cases around it.
const cases: [name: string, input: StageInput, want: Stage][] = [
  ['never left the Hub', { record: null, sendHeight: null, client: client(HS), eth: nothingOnEth }, 'home-hub'],
  ['record, Hs known, client unknown', { record, sendHeight: HS, client: null, eth: nothingOnEth }, 'locked'],
  ['client behind Hs', { record, sendHeight: HS, client: client(HS - 5), eth: nothingOnEth }, 'catching-up'],
  ['client exactly at Hs is not enough', { record, sendHeight: HS, client: client(HS), eth: nothingOnEth }, 'catching-up'],
  ['client past Hs, not proven', { record, sendHeight: HS, client: client(HS + 1), eth: nothingOnEth }, 'proving'],
  ['proven, not minted', { record, sendHeight: HS, client: client(HS + 1), eth: eth(ALICE) }, 'ready'],
  ['minted', { record, sendHeight: HS, client: client(HS + 1), eth: eth(ALICE, ALICE) }, 'home-eth'],
  ['minted, since sold to someone else', { record, sendHeight: HS, client: client(HS + 1), eth: eth(ALICE, BOB) }, 'home-eth'],
  ['Hs unknown: do not guess', { record, sendHeight: null, client: client(HS + 1), eth: nothingOnEth }, 'crossing'],
  ['Hs unknown but proven', { record, sendHeight: null, client: client(HS + 1), eth: eth(ALICE) }, 'ready'],
  ['frozen client still reports the stage', { record, sendHeight: HS, client: client(HS + 1, true), eth: nothingOnEth }, 'proving'],
  ['Ethereum read failed', { record, sendHeight: HS, client: client(HS + 1), eth: null }, 'proving'],
]

describe('deriveStage', () => {
  it.each(cases)('%s', (_name, input, want) => {
    expect(deriveStage(input)).toBe(want)
  })
})

describe('blocksToGo', () => {
  it('counts until the client passes Hs', () => {
    expect(blocksToGo(HS, HS - 9)).toBe(10)
    expect(blocksToGo(HS, HS)).toBe(1)
    expect(blocksToGo(HS, HS + 1)).toBe(0)
  })
})

describe('isStuck', () => {
  const now = new Date('2026-09-27T17:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms)

  it('only while proving, and only past the threshold', () => {
    expect(isStuck('proving', ago(STUCK_AFTER_MS + 1), now)).toBe(true)
    expect(isStuck('proving', ago(STUCK_AFTER_MS - 1), now)).toBe(false)
    expect(isStuck('catching-up', ago(2 * STUCK_AFTER_MS), now)).toBe(false)
    expect(isStuck('proving', null, now)).toBe(false)
  })
})
