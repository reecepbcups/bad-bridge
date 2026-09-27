import { describe, expect, it } from 'vitest'
import type { ClaimStage, SendStage } from '../types'
import { createDemoEthWriter, createDemoHubWriter } from './adapter'
import { DEMO_ETH, DEMO_HUB } from './seed'
import { DemoSim, INSTANT } from './sim'

const newSim = () => new DemoSim({ paused: true, timeline: INSTANT })

describe('demo writers report progress like the real ones', () => {
  it('send: simulating, signing, broadcasting, and the kids are sent', async () => {
    const sim = newSim()
    const stages: SendStage[] = []
    const result = await createDemoHubWriter(sim, DEMO_HUB).send([9176], DEMO_ETH, { onStage: (s) => stages.push(s) })
    expect(stages).toEqual(['simulating', 'signing', 'broadcasting'])
    expect(sim.record(9176)).toEqual({ tokenId: 9176, recipient: DEMO_ETH })
    expect(result.height).toBe(sim.hubHeight)
  })

  it('send: a declined signature stops at signing and sends nothing', async () => {
    const sim = newSim()
    sim.setFailNext('UserRejected')
    const stages: SendStage[] = []
    await expect(createDemoHubWriter(sim, DEMO_HUB).send([9176], DEMO_ETH, { onStage: (s) => stages.push(s) })).rejects.toMatchObject({
      code: 'UserRejected',
    })
    expect(stages).toEqual(['simulating', 'signing'])
    expect(sim.record(9176)).toBeNull()
  })

  it('send: a failed simulation never reaches signing', async () => {
    const sim = newSim()
    const stages: SendStage[] = []
    await expect(createDemoHubWriter(sim, DEMO_HUB).send([8073], DEMO_ETH, { onStage: (s) => stages.push(s) })).rejects.toMatchObject({
      code: 'AlreadyBridged',
    })
    expect(stages).toEqual(['simulating'])
  })

  it('claim: signing, then confirming', async () => {
    const sim = newSim()
    sim.commitSend(DEMO_HUB, [9176], DEMO_ETH)
    sim.skip()
    sim.skip()
    const stages: ClaimStage[] = []
    await createDemoEthWriter(sim, DEMO_ETH).claim([9176], { onStage: (s) => stages.push(s) })
    expect(stages).toEqual(['signing', 'confirming'])
    expect(sim.kidStatus([9176]).get(9176)?.owner).toBe(DEMO_ETH)
  })

  it('claim: a failure stops at signing', async () => {
    const stages: ClaimStage[] = []
    await expect(createDemoEthWriter(newSim(), DEMO_ETH).claim([9176], { onStage: (s) => stages.push(s) })).rejects.toMatchObject({
      code: 'NotProven',
    })
    expect(stages).toEqual(['signing'])
  })

  it('works without options', async () => {
    await expect(createDemoHubWriter(newSim(), DEMO_HUB).send([9176], DEMO_ETH)).resolves.toMatchObject({ txHash: expect.any(String) as string })
  })
})
