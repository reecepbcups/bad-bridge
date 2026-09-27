import { describe, expect, it } from 'vitest'
import { BridgeError } from '../chain/types'
import { ERROR_CODES, errorCopy, type ErrorAction } from './errors'

const ACTIONS: readonly ErrorAction[] = ['send', 'claim', 'connect', 'read']

describe('errorCopy', () => {
  const table = ERROR_CODES.flatMap((code) => ACTIONS.map((action) => [code, action] as const))

  it.each(table)('%s while %s: friendly headline and body, never the raw code', (code, action) => {
    const copy = errorCopy(new BridgeError(code, 'raw detail'), { action, walletName: 'Keplr' })
    expect(copy.title.length).toBeGreaterThan(3)
    expect(copy.body.length).toBeGreaterThan(10)
    expect(copy.title).not.toContain(code)
    expect(copy.body).not.toContain(code)
    expect(copy.title + copy.body).not.toContain('raw detail')
    expect(copy.title + copy.body).not.toMatch(/undefined|null|\[object/)
  })

  it('names the kid when the chain says which one', () => {
    expect(errorCopy(new BridgeError('AlreadyBridged', 'x', { tokenId: 8073 }), { action: 'send' }).title).toBe(
      '#8073 already crossed',
    )
    expect(errorCopy(new BridgeError('AlreadyBridged'), { action: 'send' }).title).toBe('One of these kids already crossed')
    expect(errorCopy(new BridgeError('NotProven'), { action: 'claim', tokenId: 42 }).body).toContain('#42')
    expect(errorCopy(new BridgeError('BadTokenId', 'x', { tokenId: 7 }), { action: 'send' }).title).toBe("#7's number looks off")
  })

  it('names the wallet and the right coin or chain', () => {
    expect(errorCopy(new BridgeError('UserRejected'), { action: 'send', walletName: 'Keplr' }).body).toContain('Keplr')
    expect(errorCopy(new BridgeError('UserRejected'), { action: 'claim' }).body).toContain('your wallet')
    expect(errorCopy(new BridgeError('InsufficientFunds'), { action: 'send' }).title).toContain('ATOM')
    expect(errorCopy(new BridgeError('InsufficientFunds'), { action: 'claim' }).title).toContain('ETH')
    expect(errorCopy(new BridgeError('WrongChain'), { action: 'claim', walletName: 'MetaMask' }).body).toContain('Ethereum mainnet')
    expect(errorCopy(new BridgeError('WrongChain'), { action: 'send' }).body).toContain('Cosmos Hub')
  })

  it('flags errors where a write might have landed anyway', () => {
    const safe = Object.fromEntries(ERROR_CODES.map((c) => [c, errorCopy(new BridgeError(c), { action: 'send' }).safe]))
    expect(safe).toMatchObject({ Network: false, Unknown: false, UserRejected: true, AlreadyBridged: true })
  })

  it('treats anything that is not a BridgeError as Unknown', () => {
    expect(errorCopy(new Error('boom'), { action: 'read' }).title).toBe('Something went wrong')
    expect(errorCopy('boom', { action: 'read' }).title).toBe('Something went wrong')
  })
})
