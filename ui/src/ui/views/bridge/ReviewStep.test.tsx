import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { BridgeContext, type BridgeContextValue } from '../../../chain/context'
import type { EthAddress, HubWriter, KidId, WalletState } from '../../../chain/types'
import { fakeChain, fakeEthWriter, fakeHubWriter, fakeReaders, HUB_A, LIVE, networkError, type FakeChain } from '../../../trips/fakes'
import { keys } from '../../../trips/keys'
import { FlowProvider, useFlow } from './flow'
import { chunkAddress, ReviewStep } from './ReviewStep'

// The review screen's guards, over the hand-rolled fake chain: the "Got it" tick belongs to one address, a wallet on
// another network doesn't auto-fill, burn addresses and shared hosts are refused, and stale health blocks Send.

const ME: EthAddress = '0xD2C392084761cb6E44c544B6f39dcc001fDe9775'
const OTHER: EthAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const GOT_IT = 'Got it, one way only'

function connected<A extends string>(address: A, walletName: string, extra: Partial<WalletState<A>> = {}): WalletState<A> {
  return {
    status: 'connected',
    address,
    walletName,
    options: [],
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    ...extra,
  }
}

/** Puts kids in the pick and moves to review, like the pick screen would. */
function Picked({ ids, children }: { ids: readonly KidId[]; children: ReactNode }) {
  const { flow, update } = useFlow()
  const [first] = useState(() => ({ picked: ids, step: 'review' as const }))
  // once: update() is a new function after every flow change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => update(first), [first])
  return flow.picked.length ? children : null
}

interface Harness {
  chain: FakeChain
  queryClient: QueryClient
  /** Switches the account the Ethereum wallet reports, like picking another account in MetaMask. */
  switchAccount: (address: EthAddress) => void
}

function renderReview(
  options: { chain?: FakeChain; ids?: readonly KidId[]; wrongChain?: boolean; hubWriter?: HubWriter } = {},
): Harness {
  const chain = options.chain ?? fakeChain()
  const { hub, eth } = fakeReaders(chain)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const hubWriter = options.hubWriter ?? fakeHubWriter(chain, HUB_A)
  const ids = options.ids ?? [1]
  const harness: Harness = { chain, queryClient, switchAccount: () => undefined }
  function Bridge({ children }: { children: ReactNode }) {
    const [account, setAccount] = useState<EthAddress>(ME)
    useEffect(() => {
      harness.switchAccount = setAccount
    }, [])
    const value: BridgeContextValue = {
      deployment: LIVE,
      hub,
      eth,
      hubWallet: connected(HUB_A, 'Keplr'),
      ethWallet: connected(account, 'MetaMask', { wrongChain: options.wrongChain === true }),
      hubWriter,
      ethWriter: fakeEthWriter(chain, account),
      proveKid: null,
    }
    return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>
  }
  render(
    <QueryClientProvider client={queryClient}>
      <Bridge>
        <FlowProvider>
          <Picked ids={ids}>
            <ReviewStep />
          </Picked>
        </FlowProvider>
      </Bridge>
    </QueryClientProvider>,
  )
  return harness
}

const sendButton = () => screen.getByRole('button', { name: /^(Send \d+ kids?|Checking…|Check .*…|Sending…)$/ })
const input = () => screen.getByLabelText<HTMLInputElement>('Ethereum address')

async function ready() {
  await waitFor(() => expect(sendButton()).toBeEnabled())
}

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('ReviewStep: the "Got it" tick', () => {
  it('freezes the auto-filled address, so switching accounts afterwards changes nothing', async () => {
    const user = userEvent.setup()
    const h = renderReview()
    await waitFor(() => expect(input()).toHaveValue(ME))
    await user.click(screen.getByLabelText(GOT_IT))
    await ready()

    act(() => h.switchAccount(OTHER))
    expect(input()).toHaveValue(ME)
    expect(screen.getByLabelText(GOT_IT)).toBeChecked()
    expect(sendButton()).toBeEnabled()
  })

  it('un-ticks when the recipient becomes a different address', async () => {
    const user = userEvent.setup()
    renderReview()
    await waitFor(() => expect(input()).toHaveValue(ME))
    await user.click(screen.getByLabelText(GOT_IT))
    await ready()

    await user.clear(input())
    await user.type(input(), OTHER)
    expect(screen.getByLabelText(GOT_IT)).not.toBeChecked()
    expect(sendButton()).toBeDisabled()
    expect(screen.getByText('Tick “Got it, one way only” to send.')).toBeInTheDocument()

    // ticking again is for the new address
    await user.click(screen.getByLabelText(GOT_IT))
    await ready()
  })

  it('stays ticked while the same address is edited back', async () => {
    const user = userEvent.setup()
    renderReview()
    await waitFor(() => expect(input()).toHaveValue(ME))
    await user.click(screen.getByLabelText(GOT_IT))
    await user.type(input(), '{Backspace}')
    expect(sendButton()).toBeDisabled()
    await user.type(input(), '5')
    expect(screen.getByLabelText(GOT_IT)).toBeChecked()
    await ready()
  })
})

describe('ReviewStep: recipient', () => {
  it('shows the whole address in groups of four and the msg the wallet will show', async () => {
    renderReview({ ids: [1, 2] })
    await waitFor(() => expect(input()).toHaveValue(ME))
    expect(screen.getByText(chunkAddress(ME))).toBeInTheDocument()
    expect(chunkAddress(ME)).toBe('0xD2C3 9208 4761 cb6E 44c5 44B6 f39d cc00 1fDe 9775')
    expect(screen.getByText('msg: 0sOSCEdhy25ExUS2853MAB/el3U=')).toBeInTheDocument()
    expect(screen.getByText(/for each kid\. It should match\./)).toBeInTheDocument()
  })

  it('refuses burn and system addresses', async () => {
    const user = userEvent.setup()
    renderReview()
    await waitFor(() => expect(input()).toHaveValue(ME))
    await user.clear(input())
    await user.type(input(), '0x000000000000000000000000000000000000dEaD')
    expect(screen.getByText("That's a burn or system address, not a wallet. Kids sent there are gone forever.")).toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    expect(sendButton()).toBeDisabled()
  })

  it("doesn't auto-fill from a wallet on another network until you say it's a regular wallet", async () => {
    const user = userEvent.setup()
    renderReview({ wrongChain: true })
    expect(await screen.findByText('Your wallet is on another network.')).toBeInTheDocument()
    expect(input()).toHaveValue('')
    await user.click(screen.getByLabelText("It's a regular wallet: use the same address on Ethereum"))
    expect(input()).toHaveValue(ME)
    expect(screen.queryByText('Your wallet is on another network.')).not.toBeInTheDocument()
  })
})

describe('ReviewStep: Send stays off when it should', () => {
  it('on a shared host (a path-based IPFS gateway)', async () => {
    window.history.replaceState(null, '', '/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/')
    const user = userEvent.setup()
    renderReview()
    await waitFor(() => expect(input()).toHaveValue(ME))
    await user.click(screen.getByLabelText(GOT_IT))
    expect(await screen.findByText(/Sending is off on this web address/)).toBeInTheDocument()
    expect(sendButton()).toBeDisabled()
  })

  it('when the last health read failed, even with old numbers that look fine', async () => {
    const user = userEvent.setup()
    const h = renderReview()
    await waitFor(() => expect(input()).toHaveValue(ME))
    await user.click(screen.getByLabelText(GOT_IT))
    await ready()

    h.chain.fail.client = networkError()
    await act(() => h.queryClient.invalidateQueries({ queryKey: keys.client(LIVE.id), refetchType: 'none' }))
    await act(() => h.queryClient.refetchQueries({ queryKey: keys.health(LIVE.id) }))
    expect(await screen.findByText(/Can't reach the chains to check the bridge right now/)).toBeInTheDocument()
    expect(sendButton()).toBeDisabled()
  })

  it('for more than 100 kids', async () => {
    renderReview({ ids: Array.from({ length: 101 }, (_, i) => i + 1) })
    expect(await screen.findByText('Send up to 100 at a time. Take some out and send the rest after.')).toBeInTheDocument()
    expect(sendButton()).toBeDisabled()
  })
})

describe('ReviewStep: sending', () => {
  it('keeps focus on Send while it runs (aria-disabled, not disabled) and announces progress', async () => {
    const user = userEvent.setup()
    const chain = fakeChain()
    const hubWriter = { ...fakeHubWriter(chain, HUB_A), send: () => new Promise<never>(() => undefined) }
    renderReview({ chain, hubWriter })
    await waitFor(() => expect(input()).toHaveValue(ME))
    await user.click(screen.getByLabelText(GOT_IT))
    await ready()
    await user.click(sendButton())
    await waitFor(() => expect(sendButton()).toHaveAttribute('aria-disabled', 'true'))
    expect(sendButton()).not.toHaveAttribute('disabled')
    expect(sendButton()).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Checking the send with the Hub…')
  })

  it('says "both" for two kids', async () => {
    const user = userEvent.setup()
    renderReview({ ids: [1, 2] })
    await waitFor(() => expect(input()).toHaveValue(ME))
    await user.click(screen.getByLabelText(GOT_IT))
    await ready()
    expect(screen.getByRole('status')).toHaveTextContent('Keplr asks you to sign once, for both kids.')
  })
})
