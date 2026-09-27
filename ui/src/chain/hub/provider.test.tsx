// The real graz (not mocked) under HubWalletProvider: it mounts, and the hooks read a disconnected wallet.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEPLOYMENTS } from '../../config/deployments'
import { grazOptions, HubWalletProvider } from './provider'
import { useHubWallet, useHubWriter } from './wallet'

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

describe('grazOptions', () => {
  it('signs the simulated fee as given, and turns WalletConnect analytics off', () => {
    expect(grazOptions(deployment, undefined, 'https://bridge.test').walletConnect).toBeUndefined()
    const options = grazOptions(deployment, 'abc123', 'https://bridge.test')
    expect(options.walletDefaultOptions?.sign).toMatchObject({ preferNoSetFee: true })
    expect(options.walletConnect?.options).toMatchObject({ projectId: 'abc123', telemetryEnabled: false })
  })
})
