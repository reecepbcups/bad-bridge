import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEMO_ETH, DEMO_HUB } from '../chain/demo/seed'
import { demoWrapper } from '../test/demo'
import { useConfigSanity, useHealth, useOwnedKids, useTrips } from './hooks'

// The pattern for hook tests: renderHook over demoWrapper(), then waitFor the query to settle.

describe('trip hooks over the demo adapter', () => {
  it('finds the mockup trips by Ethereum address, ready first', async () => {
    const { result } = renderHook(() => useTrips({ eth: DEMO_ETH }), { wrapper: demoWrapper() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.map((t) => [t.tokenId, t.stage])).toEqual([
      [9254, 'ready'],
      [8783, 'proving'],
      [8073, 'home-eth'],
    ])
  })

  it("lists the Hub wallet's kids, still-home ones first", async () => {
    const { result } = renderHook(() => useOwnedKids(), { wrapper: demoWrapper() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    const trips = result.current.data ?? []
    expect(trips.map((t) => t.tokenId)).toEqual([663, 3838, 4801, 6413, 9176, 8073])
    expect(trips.at(-1)).toMatchObject({ stage: 'home-eth', sender: DEMO_HUB })
  })

  it('reports health and passes the config sanity check', async () => {
    const { result } = renderHook(() => ({ health: useHealth(), sanity: useConfigSanity() }), { wrapper: demoWrapper() })
    await waitFor(() => expect(result.current.sanity.data).toBeDefined())
    await waitFor(() => expect(result.current.health.data).toBeDefined())
    expect(result.current.sanity.data).toEqual({ ok: true, problems: [] })
    expect(result.current.health.data).toMatchObject({ lagBlocks: 100, lagMinutes: 10, frozen: false, stale: false })
  })
})
