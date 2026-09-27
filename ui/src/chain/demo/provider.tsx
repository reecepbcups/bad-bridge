import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Deployment } from '../../config/deployments'
import { BridgeContext, type BridgeContextValue } from '../context'
import type { EthAddress, HubAddress } from '../types'
import { createDemoEthWriter, createDemoHubWriter, createDemoReaders, createDemoWallet } from './adapter'
import { DemoControlsContext, type DemoControls } from './controls'
import { demoOptionsFromSearch } from './options'
import { DemoSim, type DemoOptions } from './sim'

declare global {
  interface Window {
    /** The running demo sim, for e2e tests and poking around in devtools. Demo mode only. */
    badBridgeDemo?: DemoSim
  }
}

const TICK_MS = 250

/** In-memory chain adapters over a DemoSim. Needs a QueryClientProvider above it. */
export default function DemoBridgeProvider({
  deployment,
  options,
  children,
}: {
  deployment: Deployment
  /** Defaults to the `?demo=` flags in the URL. */
  options?: DemoOptions
  children: ReactNode
}) {
  const [sim] = useState(() => new DemoSim(options ?? demoOptionsFromSearch(location.search)))
  const snapshot = useSyncExternalStore(sim.subscribe, sim.getSnapshot)
  const queryClient = useQueryClient()

  // chain state changed: refetch everything, like a new block would on the real chains
  useEffect(() => sim.subscribe(() => void queryClient.invalidateQueries()), [sim, queryClient])

  useEffect(() => {
    const timer = setInterval(() => sim.tick(TICK_MS), TICK_MS)
    return () => clearInterval(timer)
  }, [sim])

  useEffect(() => {
    window.badBridgeDemo = sim
    return () => {
      delete window.badBridgeDemo
    }
  }, [sim])

  const readers = useMemo(() => createDemoReaders(sim, deployment), [sim, deployment])
  const hubWallet = useMemo(() => createDemoWallet<HubAddress>(sim, 'hub', snapshot.hubWallet), [sim, snapshot.hubWallet])
  const ethWallet = useMemo(() => createDemoWallet<EthAddress>(sim, 'eth', snapshot.ethWallet), [sim, snapshot.ethWallet])
  const hubWriter = useMemo(
    () => (hubWallet.status === 'connected' && hubWallet.address ? createDemoHubWriter(sim, hubWallet.address) : null),
    [sim, hubWallet],
  )
  const ethWriter = useMemo(
    () => (ethWallet.status === 'connected' && ethWallet.address ? createDemoEthWriter(sim, ethWallet.address) : null),
    [sim, ethWallet],
  )

  const value = useMemo<BridgeContextValue>(
    () => ({ deployment, ...readers, hubWallet, ethWallet, hubWriter, ethWriter }),
    [deployment, readers, hubWallet, ethWallet, hubWriter, ethWriter],
  )

  const controls = useMemo<DemoControls>(
    () => ({
      snapshot,
      skip: () => sim.skip(),
      advance: (ms) => sim.advance(ms),
      setPaused: (on) => sim.setPaused(on),
      setFrozen: (on) => sim.setFrozen(on),
      setStuck: (on) => sim.setStuck(on),
      setOffline: (on) => sim.setOffline(on),
      setFailNext: (code) => sim.setFailNext(code),
      setWallet: (chain, connected) => sim.setWallet(chain, connected),
      reset: () => sim.reset(),
    }),
    [sim, snapshot],
  )

  return (
    <BridgeContext.Provider value={value}>
      <DemoControlsContext.Provider value={controls}>{children}</DemoControlsContext.Provider>
    </BridgeContext.Provider>
  )
}
