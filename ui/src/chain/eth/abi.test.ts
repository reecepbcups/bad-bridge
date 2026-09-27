import { toFunctionSelector } from 'viem'
import { describe, expect, it } from 'vitest'
import { bridgeAbi, lightClientAbi, multicall3WriteAbi } from './abi'

// Errors hash like functions: the first 4 bytes of keccak256(signature).
// From `forge inspect BadBridge methodIdentifiers` and `forge inspect BadBridge errors` in eth/.
const FORGE_FUNCTIONS: Record<string, string> = {
  'ESCROW()': '0xe681c4aa',
  'claim(uint32)': '0x04951891',
  'lightClient()': '0xb5700e68',
  'ownerOf(uint256)': '0x6352211e',
  'proven(uint32)': '0xec703b2c',
}
const FORGE_ERRORS: Record<string, string> = {
  'NotProven(uint32)': '0x713871e1',
  'ClientFrozen()': '0x59869f4e',
  'ERC721NonexistentToken(uint256)': '0x7e273289',
  'ERC721InvalidSender(address)': '0x73c6ac6e',
  'ERC721InvalidReceiver(address)': '0x64a0ae92',
}

type Item = { type: string; name?: string; inputs?: readonly { type: string }[] }
const signature = (item: Item) => `${item.name}(${(item.inputs ?? []).map((i) => i.type).join(',')})`
const selectors = (items: readonly Item[]) => Object.fromEntries(items.map((x) => [signature(x), toFunctionSelector(signature(x))]))

describe('abi', () => {
  it('matches BadBridge.sol selector for selector', () => {
    expect(selectors(bridgeAbi.filter((x) => x.type === 'function'))).toEqual(FORGE_FUNCTIONS)
    expect(selectors(bridgeAbi.filter((x) => x.type === 'error'))).toEqual(FORGE_ERRORS)
  })

  it('has the ISP1ICS07Tendermint clientState() and Multicall3 aggregate3 selectors', () => {
    expect(toFunctionSelector(lightClientAbi.find((x) => x.type === 'function')!)).toBe('0xbd3ce6b0')
    expect(toFunctionSelector(multicall3WriteAbi.find((x) => x.type === 'function')!)).toBe('0x82ad56cb')
  })
})
