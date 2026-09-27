// Read-only mainnet checks of the Ethereum adapter against reece-test: #2 and #3 bridged, #1 still on the Hub.

import { fromBech32 } from '@cosmjs/encoding'
import { bytesToHex, getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { createEthReader, KID_STATUS_CHUNK } from '../../src/chain/eth/reader'
import { DEPLOYMENTS } from '../../src/config/deployments'

const d = DEPLOYMENTS['reece-test']
const reader = createEthReader(d)
// bridged #2 and #3 to itself. An EIP-7702-delegated EOA, so it has code but isn't a contract.
const REECE = getAddress('0xd2c392084761cb6e44c544b6f39dcc001fde9775')
// the block the #3 send landed in on the Hub
const SEND_HEIGHT_3 = 33_092_463

describe('eth reader on mainnet (reece-test)', () => {
  it('kidStatus: #2 and #3 proven and minted to Reece, #1 untouched', async () => {
    const status = await reader.kidStatus([1, 2, 3])
    expect(status.get(1)).toEqual({ proven: null, owner: null })
    expect(status.get(2)).toEqual({ proven: REECE, owner: REECE })
    expect(status.get(3)).toEqual({ proven: REECE, owner: REECE })
  })

  it('kidStatus: several full multicall chunks in one go', async () => {
    const ids = Array.from({ length: 3 * KID_STATUS_CHUNK }, (_, i) => i + 1)
    const status = await reader.kidStatus(ids)
    expect(status.size).toBe(ids.length)
    const bridged = [...status].filter(([, s]) => s.proven !== null || s.owner !== null).map(([id]) => id)
    expect(bridged).toEqual([2, 3])
  })

  it('client: past the #3 send, not frozen', async () => {
    const client = await reader.client()
    expect(client.latestHeight).toBeGreaterThan(SEND_HEIGHT_3)
    expect(client.frozen).toBe(false)
  })

  it('bridgeEscrow: the bech32-decoded escrow', async () => {
    expect(await reader.bridgeEscrow()).toBe(bytesToHex(fromBech32(d.hub.escrow ?? '').data))
  })

  it('isContract: false for a 7702-delegated EOA, true for the bridge', async () => {
    expect(await reader.isContract(REECE)).toBe(false)
    expect(await reader.isContract(d.eth.bridge ?? '0x')).toBe(true)
  })
})
