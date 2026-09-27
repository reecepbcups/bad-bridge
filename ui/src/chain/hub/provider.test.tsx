// The real graz (not mocked) under HubWalletProvider: it mounts, and the hooks read a disconnected wallet.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEPLOYMENTS } from '../../config/deployments'
import { HubWalletProvider } from './provider'
import { useHubWallet, useHubWriter } from './wallet'

// graz pulls in @walletconnect/modal, which calls window.matchMedia while it's being imported. jsdom has the key
// with an undefined value, so src/test/setup.ts's `'matchMedia' in window` guard skips its stub.
vi.hoisted(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList
  }
})

const deployment = DEPLOYMENTS['reece-test']

function Probe() {
  const wallet = useHubWallet(deployment)
  const writer = useHubWriter(deployment)
  return (
    <p>
      {wallet.status}|{wallet.options.map((o) => o.id).join(',')}|{writer ? 'writer' : 'no writer'}
    </p>
  )
}

describe('HubWalletProvider with real graz', () => {
  it('mounts its children (a tick later) and reports a disconnected wallet', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HubWalletProvider deployment={deployment}>
          <Probe />
        </HubWalletProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('disconnected|keplr,leap,cosmostation|no writer')).toBeInTheDocument()
  })
})
