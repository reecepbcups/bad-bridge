// RealBridgeProvider with the real graz and wagmi (no wallet extensions in jsdom): the page renders from the
// readers at once, and the wallets slot in when their chunk arrives, without re-mounting anything below.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEPLOYMENTS } from '../config/deployments'
import { useBridge } from './context'
import RealBridgeProvider from './real'

const deployment = DEPLOYMENTS['reece-test']

function Probe({ onMount }: { onMount: () => void }) {
  const { hub, eth, hubWallet, ethWallet, hubWriter, ethWriter } = useBridge()
  useEffect(onMount, [onMount])
  return (
    <p>
      {[
        typeof hub.record === 'function' && typeof eth.kidStatus === 'function' ? 'readers' : 'no readers',
        hubWallet.status,
        ethWallet.status,
        hubWallet.options.map((o) => `${o.id}:${o.installed ? 'yes' : 'no'}`).join(','),
        ethWallet.options.map((o) => o.id).join(','),
        hubWriter || ethWriter ? 'writers' : 'no writers',
      ].join('|')}
    </p>
  )
}

describe('RealBridgeProvider', () => {
  it('renders from the readers at once, then the wallets slot in without re-mounting the page', async () => {
    const onMount = vi.fn()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RealBridgeProvider deployment={deployment}>
          <Probe onMount={onMount} />
        </RealBridgeProvider>
      </QueryClientProvider>,
    )
    // before the wallet chunk: readers work, wallets read as connecting, with nothing to offer yet
    expect(screen.getByText('readers|connecting|connecting|||no writers')).toBeInTheDocument()

    // after: nothing installed in jsdom; Coinbase is a web wallet, so it's always offered
    expect(
      await screen.findByText('readers|disconnected|disconnected|keplr:no,leap:no,cosmostation:no|coinbaseWalletSDK|no writers', undefined, {
        timeout: 5_000,
      }),
    ).toBeInTheDocument()
    expect(onMount).toHaveBeenCalledTimes(1)
  })

  it('a wallet that is still loading refuses to connect instead of hanging', async () => {
    let connect: (() => Promise<void>) | undefined
    function Grab() {
      const { hubWallet } = useBridge()
      connect ??= () => hubWallet.connect('keplr')
      return null
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RealBridgeProvider deployment={deployment}>
          <Grab />
        </RealBridgeProvider>
      </QueryClientProvider>,
    )
    await expect(connect?.()).rejects.toMatchObject({ name: 'BridgeError' })
  })
})
