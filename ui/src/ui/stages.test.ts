import { describe, expect, it } from 'vitest'
import type { Stage } from '../trips/types'
import { provingSeen, PROVING_QUIET_MS } from './StageList'
import { JOURNEY, JOURNEY_AT, lowerFirst, STAGE_LINE, TRACK_LABELS } from './stages'

const STAGES: readonly Stage[] = ['home-hub', 'locked', 'catching-up', 'crossing', 'proving', 'ready', 'home-eth']

describe('one journey vocabulary', () => {
  it('names the same four steps in the stage list and the track bar', () => {
    expect(JOURNEY).toEqual(['Sent', 'Ethereum caught up', 'Proven', 'Claimed on Ethereum'])
    expect(TRACK_LABELS).toHaveLength(JOURNEY.length)
    TRACK_LABELS.forEach((label, i) => expect(JOURNEY[i]).toContain(label))
  })

  it.each<[Stage, number]>([
    ['home-hub', 0],
    ['locked', 1],
    ['catching-up', 1],
    ['crossing', 1],
    ['proving', 2],
    ['ready', 3],
    ['home-eth', 4],
  ])('%s is on step %i', (stage, step) => {
    expect(JOURNEY_AT[stage]).toBe(step)
  })

  it('has a line for every stage, without the old jargon', () => {
    for (const stage of STAGES) {
      expect(STAGE_LINE[stage].length).toBeGreaterThan(3)
      expect(STAGE_LINE[stage]).not.toMatch(/batcher|send_nft|Eureka|Seen\b/)
    }
    expect(lowerFirst(STAGE_LINE['catching-up'])).toBe('waiting for Ethereum to catch up')
  })
})

describe('provingSeen', () => {
  const since = new Date(2026, 8, 27, 21, 41)
  it('says nothing for the first few minutes', () => {
    expect(provingSeen(undefined, since.getTime() + PROVING_QUIET_MS)).toBeNull()
    expect(provingSeen(since, since.getTime() + PROVING_QUIET_MS - 1)).toBeNull()
  })
  it('then says since when this device has seen it proving', () => {
    expect(provingSeen(since, since.getTime() + PROVING_QUIET_MS)).toBe('Seen proving on this device since 9:41 pm.')
  })
})
