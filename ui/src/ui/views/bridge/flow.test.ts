import { describe, expect, it } from 'vitest'
import type { Stage, Trip } from '../../../trips/types'
import { currentStep, type Flow } from './flow'

const base: Flow = { step: 'pick', picked: [], recipient: null, sent: null, claimTx: null }
const sent: Flow = {
  ...base,
  sent: { ids: [1, 2], recipient: '0x8f3a41b7e2D09C6A5E1f7b3C2d9A0e4f6b8Cc21d', txHash: 'AB' },
}
const trip = (tokenId: number, stage: Stage): Trip => ({ tokenId, stage, recipient: null, stuck: false })

describe('currentStep', () => {
  it('follows the stored step before sending', () => {
    expect(currentStep(base, undefined)).toBe('pick')
    expect(currentStep({ ...base, step: 'review' }, undefined)).toBe('review')
  })

  it.each<[stages: [Stage, Stage] | null, expected: string]>([
    [null, 'crossing'], // no data yet
    [['catching-up', 'catching-up'], 'crossing'],
    [['proving', 'ready'], 'crossing'], // the group waits for its slowest kid
    [['crossing', 'ready'], 'crossing'],
    [['ready', 'ready'], 'claim'],
    [['ready', 'home-eth'], 'claim'], // one was claimed elsewhere: claim the other
    [['home-eth', 'home-eth'], 'done'], // a batcher claimed for us
  ])('after a send: %j → %s', (stages, expected) => {
    const trips = stages ? [trip(1, stages[0]), trip(2, stages[1])] : undefined
    expect(currentStep(sent, trips)).toBe(expected)
  })

  it('waits until every sent kid has a trip', () => {
    expect(currentStep(sent, [trip(1, 'ready')])).toBe('crossing')
  })

  it('is done once this page claimed', () => {
    expect(currentStep({ ...sent, claimTx: '0xabc' }, [trip(1, 'ready'), trip(2, 'ready')])).toBe('done')
  })
})
