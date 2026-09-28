// What the Hub wallets (through graz, and Leap directly) are told about the chain.

import type { ChainInfo } from '@keplr-wallet/types'
import type { Deployment } from '../../config/deployments'

/** The Hub's feemarket floor on 2026-09-27 is 0.005 uatom/gas; the steps give the wallet room above it. */
export const GAS_PRICE_STEP = { low: 0.005, average: 0.0075, high: 0.01 } as const

/** A complete Keplr-style ChainInfo for the deployment's Hub: its RPC and REST, bech32 `cosmos`, ATOM for fees. */
export function hubChainInfo(deployment: Deployment): ChainInfo {
  const hub = deployment.hub
  const rpc = hub.rpc[0]
  const rest = hub.rest[0]
  if (!rpc || !rest) throw new Error(`deployment ${deployment.id} needs at least one Hub RPC and REST endpoint`)
  const p = hub.bech32Prefix
  const atom = { coinDenom: 'ATOM', coinMinimalDenom: hub.gasDenom, coinDecimals: 6, coinGeckoId: 'cosmos' }
  return {
    chainId: hub.chainId,
    chainName: hub.chainName,
    rpc,
    rest,
    bip44: { coinType: 118 },
    bech32Config: {
      bech32PrefixAccAddr: p,
      bech32PrefixAccPub: `${p}pub`,
      bech32PrefixValAddr: `${p}valoper`,
      bech32PrefixValPub: `${p}valoperpub`,
      bech32PrefixConsAddr: `${p}valcons`,
      bech32PrefixConsPub: `${p}valconspub`,
    },
    currencies: [atom],
    feeCurrencies: [{ ...atom, gasPriceStep: { ...GAS_PRICE_STEP } }],
    stakeCurrency: atom,
    features: [],
  }
}
