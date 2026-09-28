import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { deployment, isDemo } from './config/deployments'
import { Broken } from './ui/Broken'
import { DemoBanner } from './ui/chrome/DemoBanner'
import { LoadingShell } from './ui/chrome/LoadingShell'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { Root } from './ui/Root'

// Lazy, so a demo page never downloads the wallet libraries and a real page never ships the sim.
const DemoBridgeProvider = lazy(() => import('./chain/demo/provider'))
const RealBridgeProvider = lazy(() => import('./chain/real'))

const queryClient = new QueryClient({
  defaultOptions: {
    // the real adapters retry across endpoints themselves
    queries: { retry: 1, staleTime: 10_000 },
  },
})

export function App() {
  const BridgeProvider = deployment.demo ? DemoBridgeProvider : RealBridgeProvider
  return (
    <QueryClientProvider client={queryClient}>
      {isDemo && <DemoBanner />}
      <ErrorBoundary fallback={(error) => <Broken error={error} deployment={deployment} />}>
        <Suspense fallback={<LoadingShell />}>
          <BridgeProvider deployment={deployment}>
            <Root />
          </BridgeProvider>
        </Suspense>
      </ErrorBoundary>
    </QueryClientProvider>
  )
}
