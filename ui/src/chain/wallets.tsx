import { memo, useEffect } from 'react'
import type { Deployment } from '../config/deployments'
import type { BridgeContextValue } from './context'
import { EthWalletProvider } from './eth/provider'
import { useEthWallet, useEthWriter } from './eth/wallet'
import { HubWalletProvider } from './hub/provider'
import { useHubWallet, useHubWriter } from './hub/wallet'

/** The wallet half of BridgeContext. */
export type Wallets = Pick<BridgeContextValue, 'hubWallet' | 'ethWallet' | 'hubWriter' | 'ethWriter'>

interface Props {
  deployment: Deployment
  /** Gets the wallets whenever one of them changes. Must be stable. */
  onChange: (wallets: Wallets) => void
}

/**
 * The real wallets: wagmi and graz with their providers, reporting up through `onChange` whenever a wallet or
 * writer changes. Renders nothing itself. real.tsx lazy-loads it, so the page never waits for these libraries.
 * Memoized, so the re-render its own report causes upstairs stops here.
 */
const RealWallets = memo(function RealWallets({ deployment, onChange }: Props) {
  return (
    <EthWalletProvider deployment={deployment}>
      <HubWalletProvider deployment={deployment}>
        <Report deployment={deployment} onChange={onChange} />
      </HubWalletProvider>
    </EthWalletProvider>
  )
})

export default RealWallets

function Report({ deployment, onChange }: Props) {
  const hubWallet = useHubWallet(deployment)
  const ethWallet = useEthWallet(deployment)
  const hubWriter = useHubWriter(deployment)
  const ethWriter = useEthWriter(deployment)
  // each of these is memoized by its hook, so this only fires on a real change
  useEffect(() => onChange({ hubWallet, ethWallet, hubWriter, ethWriter }), [onChange, hubWallet, ethWallet, hubWriter, ethWriter])
  return null
}
