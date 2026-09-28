// Test helpers: render components or hooks over the demo adapter, with no delays and the clock stopped.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import DemoBridgeProvider from '../chain/demo/provider'
import { INSTANT, type DemoOptions } from '../chain/demo/sim'
import { DEPLOYMENTS } from '../config/deployments'

/** A wrapper for render()/renderHook(): fresh QueryClient, demo adapter, instant timeline, paused clock. */
export function demoWrapper(options: DemoOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function DemoWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <DemoBridgeProvider deployment={DEPLOYMENTS.demo} options={{ paused: true, ...options, timeline: { ...INSTANT, ...options.timeline } }}>
          {children}
        </DemoBridgeProvider>
      </QueryClientProvider>
    )
  }
}
