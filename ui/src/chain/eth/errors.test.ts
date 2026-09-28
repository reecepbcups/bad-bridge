import {
  ChainMismatchError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  HttpRequestError,
  InsufficientFundsError,
  TimeoutError,
  UserRejectedRequestError,
  zeroAddress,
} from 'viem'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { BridgeError } from '../types'
import { bridgeAbi } from './abi'
import { decodeRevert, toEthError } from './errors'

const notProven7 = encodeErrorResult({ abi: bridgeAbi, errorName: 'NotProven', args: [7] })

function reverted(data: `0x${string}`) {
  const cause = new ContractFunctionRevertedError({ abi: bridgeAbi, data, functionName: 'claim' })
  return new ContractFunctionExecutionError(cause, { abi: bridgeAbi, functionName: 'claim', args: [7] })
}

describe('toEthError', () => {
  it('passes BridgeErrors through', () => {
    const e = new BridgeError('NotLive')
    expect(toEthError(e)).toBe(e)
  })

  it('finds user rejections however the wallet wraps them', () => {
    expect(toEthError(new UserRejectedRequestError(new Error('nope')))).toMatchObject({ code: 'UserRejected' })
    expect(toEthError(Object.assign(new Error('whatever'), { code: 4001 }))).toMatchObject({ code: 'UserRejected' })
    expect(toEthError(new Error('outer', { cause: { code: 4001, message: 'x' } }))).toMatchObject({ code: 'UserRejected' })
    expect(toEthError({ code: 'ACTION_REJECTED' })).toMatchObject({ code: 'UserRejected' })
    expect(toEthError(new Error('MetaMask Tx Signature: User denied transaction signature.'))).toMatchObject({ code: 'UserRejected' })
  })

  it('finds insufficient funds', () => {
    expect(toEthError(new InsufficientFundsError())).toMatchObject({ code: 'InsufficientFunds' })
    expect(toEthError(new Error('Internal JSON-RPC error.', { cause: new Error('insufficient funds for gas * price + value') }))).toMatchObject({
      code: 'InsufficientFunds',
    })
  })

  it('decodes NotProven(uint32) with its token id', () => {
    expect(toEthError(reverted(notProven7))).toMatchObject({ code: 'NotProven', tokenId: 7 })
  })

  it('reads a mint of an existing token as already minted', () => {
    const data = encodeErrorResult({ abi: bridgeAbi, errorName: 'ERC721InvalidSender', args: [zeroAddress] })
    const e = toEthError(reverted(data), 3)
    expect(e).toMatchObject({ code: 'AlreadyBridged', tokenId: 3 })
    expect(e.detail).toMatch(/already minted/)
  })

  it('maps chain mismatches to WrongChain', () => {
    expect(toEthError(new ChainMismatchError({ chain: mainnet, currentChainId: 137 }))).toMatchObject({ code: 'WrongChain' })
    expect(toEthError(Object.assign(new Error('x'), { name: 'ConnectorChainMismatchError' }))).toMatchObject({ code: 'WrongChain' })
  })

  it('maps transport failures to Network and everything else to Unknown', () => {
    expect(toEthError(new HttpRequestError({ url: 'https://rpc.example', status: 429 }))).toMatchObject({ code: 'Network' })
    expect(toEthError(new TimeoutError({ body: {}, url: 'https://rpc.example' }))).toMatchObject({ code: 'Network' })
    const other = toEthError(new Error('boom'))
    expect(other).toMatchObject({ code: 'Unknown', detail: 'boom' })
  })
})

describe('decodeRevert', () => {
  it('decodes bridge errors and gives up on junk', () => {
    expect(decodeRevert(notProven7)).toEqual({ errorName: 'NotProven', args: [7] })
    expect(decodeRevert('0xdeadbeef')).toBeUndefined()
    expect(decodeRevert('0x')).toBeUndefined()
  })
})
