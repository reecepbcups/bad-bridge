// Read-only mainnet checks that the reece-test preset points at the contracts it claims to.
// Plain fetch/viem on purpose: the adapters get their own live tests in Phase 1.

import { fromBech32 } from '@cosmjs/encoding'
import { bytesToHex, createPublicClient, http, parseAbi } from 'viem'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { DEPLOYMENTS } from '../../src/config/deployments'

const d = DEPLOYMENTS['reece-test']
const escrow = d.hub.escrow ?? ''
const bridge = d.eth.bridge ?? '0x'

async function smart<T>(contract: string, msg: object): Promise<T> {
  const q = btoa(JSON.stringify(msg))
  const res = await fetch(`${d.hub.rest[0]}/cosmwasm/wasm/v1/contract/${contract}/smart/${q}`)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return ((await res.json()) as { data: T }).data
}

describe('reece-test on mainnet', () => {
  it('escrow accepts the configured cw721', async () => {
    expect(await smart<string>(escrow, { config: {} })).toBe(d.hub.cw721)
  })

  it('escrow has records for #2 and #3 but not #1', async () => {
    expect(await smart<string | null>(escrow, { record: { token_id: 1 } })).toBeNull()
    expect(await smart<string | null>(escrow, { record: { token_id: 2 } })).toMatch(/^[0-9a-f]{40}$/)
    expect(await smart<string | null>(escrow, { record: { token_id: 3 } })).toMatch(/^[0-9a-f]{40}$/)
  })

  it('bridge trusts the configured escrow', async () => {
    const client = createPublicClient({ chain: mainnet, transport: http(d.eth.rpc[0]) })
    const onChain = await client.readContract({ address: bridge, abi: parseAbi(['function ESCROW() view returns (bytes32)']), functionName: 'ESCROW' })
    expect(onChain.toLowerCase()).toBe(bytesToHex(fromBech32(escrow).data))
  })
})
