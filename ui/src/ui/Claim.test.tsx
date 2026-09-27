import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BridgeContext, type BridgeContextValue } from '../chain/context'
import type { EthAddress, WalletState } from '../chain/types'
import { DEPLOYMENTS } from '../config/deployments'
import { ALICE, fakeChain, fakeEthWriter, fakeReaders, LIVE, send } from '../trips/fakes'
import type { Trip } from '../trips/types'
import { claimedToast, formatEth } from './Claim'
import { ClaimStep } from './views/bridge/ClaimStep'

describe('formatEth', () => {
  it('shows wei as ETH to two significant figures', () => {
    expect(formatEth('218000000000000')).toBe('0.00022 ETH')
    expect(formatEth('79000000000000')).toBe('0.000079 ETH')
    expect(formatEth('600000000000000')).toBe('0.0006 ETH')
    expect(formatEth('1234500000000000000')).toBe('1.2 ETH')
    expect(formatEth('0')).toBe('0 ETH')
    expect(formatEth('999')).toBe('< 0.000001 ETH')
    expect(formatEth('nope')).toBe('nope wei')
  })
})

describe('claimedToast', () => {
  it('is the same everywhere: kids in the order given, one body, an Etherscan link', () => {
    const explorer = DEPLOYMENTS['reece-test'].explorer
    expect(claimedToast([9176, 6413], '0xabc', explorer)).toEqual({
      tone: 'ok',
      title: 'Claimed #9176 & #6413',
      body: 'Minted on Ethereum. Welcome home.',
      link: { href: 'https://etherscan.io/tx/0xabc', label: 'See it on Etherscan' },
    })
    expect(claimedToast([1, 2, 3, 4], '0xabc', explorer).title).toBe('Claimed 4 kids')
  })
})

describe('ClaimStep', () => {
  it('shows the claim fee estimate and says "both" for two kids', async () => {
    const chain = fakeChain({ gasPrice: 2_000_000_000n })
    for (const id of [5, 3]) {
      send(chain, id, 100, ALICE)
      chain.proven.set(id, ALICE)
    }
    const { hub, eth } = fakeReaders(chain)
    const wallet: WalletState<EthAddress> = {
      status: 'connected',
      address: ALICE,
      walletName: 'MetaMask',
      options: [],
      connect: () => Promise.resolve(),
      disconnect: () => Promise.resolve(),
    }
    const value = { deployment: LIVE, hub, eth, ethWallet: wallet, ethWriter: fakeEthWriter(chain, ALICE), hubWriter: null } as unknown as BridgeContextValue
    const trips = [3, 5].map((id): Trip => ({ tokenId: id, stage: 'ready', recipient: ALICE, stuck: false }))
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BridgeContext.Provider value={value}>
          <ClaimStep sent={{ ids: [5, 3], recipient: ALICE, txHash: 'AB' }} trips={trips} />
        </BridgeContext.Provider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('≈ 0.00022 ETH network fee.')).toBeInTheDocument()
    expect(screen.getByText(/Claim to mint both kids/)).toBeInTheDocument()
    expect(screen.getByText(/One Ethereum transaction claims both\./)).toBeInTheDocument()
    expect(eth.estimateClaim).toHaveBeenCalledWith([3, 5])
    expect(document.title).toBe('Ready to claim · Bad Bridge')
  })
})
