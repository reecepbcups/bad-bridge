import { isBridgeError, toBridgeError, type BridgeError, type BridgeErrorCode, type KidId } from '../chain/types'

// Kid-friendly copy for every BridgeErrorCode. Headlines never show the raw code; `detail` goes in a disclosure.

/** Every code, so tests can walk the whole table. Adding a code to BridgeErrorCode fails typecheck here. */
export const ERROR_CODES = [
  'WrongCollection',
  'BadTokenId',
  'BadRecipient',
  'ZeroRecipient',
  'AlreadyBridged',
  'NotOwner',
  'TooManyKids',
  'FeeTooHigh',
  'ClientFrozen',
  'NotProven',
  'UserRejected',
  'InsufficientFunds',
  'WrongChain',
  'NotLive',
  'Network',
  'Unknown',
] as const satisfies readonly BridgeErrorCode[]

// compile-time check that ERROR_CODES lists every code
type Missing = Exclude<BridgeErrorCode, (typeof ERROR_CODES)[number]>
const _exhaustive: Missing extends never ? true : Missing = true
void _exhaustive

/** What the user was doing, so the copy can name the right wallet, coin and chain. */
export type ErrorAction = 'send' | 'claim' | 'connect' | 'read'

export interface ErrorContext {
  action: ErrorAction
  /** "Keplr", "MetaMask"… */
  walletName?: string
  /** Falls back to the error's own tokenId. */
  tokenId?: KidId
}

export interface ErrorCopy {
  /** Short headline, in the display font. */
  title: string
  /** One or two plain sentences: what happened and what to do. */
  body: string
  /** The chain said no, so nothing moved. False for Network and Unknown: a write may have landed anyway. */
  safe: boolean
}

type CopyFn = (c: { kid: string; wallet: string; action: ErrorAction }) => Omit<ErrorCopy, 'safe'>

// COPY: every line in this table is a first draft and needs sign-off
const COPY: Readonly<Record<BridgeErrorCode, CopyFn>> = {
  WrongCollection: () => ({
    title: "The escrow doesn't take this collection",
    body: 'It only accepts Bad Kids from the official collection. Nothing was sent.',
  }),
  BadTokenId: ({ kid }) => ({
    title: `${kid === 'that kid' ? "That kid's" : `${kid}'s`} number looks off`,
    body: "The escrow couldn't read the token number, so nothing was sent.",
  }),
  BadRecipient: () => ({
    title: "That address won't work",
    body: 'The escrow wants a plain 0x Ethereum address (0x + 40 characters). Check it and try again.',
  }),
  ZeroRecipient: () => ({
    title: "That's the zero address",
    body: 'Kids sent there are gone forever, so the send was stopped before it started. Nothing was sent.',
  }),
  AlreadyBridged: ({ kid }) => ({
    title: `${kid === 'that kid' ? 'One of these kids' : kid} already crossed`,
    body: "It's already in the escrow, and a kid can only cross once. Take it out of your pick and try again.",
  }),
  NotOwner: ({ kid }) => ({
    title: `${kid === 'that kid' ? 'One of these kids' : kid} isn't in this wallet`,
    body: "The Hub says this wallet doesn't own it anymore. It may have moved since the list loaded. Nothing was sent.",
  }),
  TooManyKids: () => ({
    title: "That's a lot of kids at once",
    body: 'Send up to 100 at a time. Take some out and send the rest after. Nothing was sent.',
  }),
  FeeTooHigh: () => ({
    title: 'That fee looks wrong',
    body: 'The Hub quoted far more than a send should cost, so we stopped before your wallet opened. Nothing was sent. Try again in a bit.',
  }),
  ClientFrozen: () => ({
    title: 'The bridge is stuck for now',
    body: "Ethereum has stopped accepting updates from the Hub, so sending is off. Nothing was sent. Kids that already made it across can still be claimed.",
  }),
  NotProven: ({ kid }) => ({
    title: 'Not quite there yet',
    body: `The proof for ${kid} hasn't landed on Ethereum yet. Give it a few minutes and try again.`,
  }),
  UserRejected: ({ wallet, action }) => ({
    title: 'No worries',
    body:
      action === 'connect'
        ? `${wallet} didn't connect. Try again whenever you're ready.`
        : `You said no in ${wallet}, so nothing happened. Try again whenever you're ready.`,
  }),
  InsufficientFunds: ({ action }) =>
    action === 'claim'
      ? { title: 'Not enough ETH for gas', body: 'Claiming is a normal Ethereum transaction. Top up a little ETH and try again.' }
      : { title: 'Not enough ATOM for the fee', body: 'Sending needs a tiny bit of ATOM for the Hub fee. Top up and try again.' },
  WrongChain: ({ wallet, action }) => ({
    title: 'Wrong network',
    body:
      action === 'send'
        ? `${wallet} is on a different network. Switch it to Cosmos Hub and try again.`
        : `${wallet} is on a different network. Switch it to Ethereum mainnet and try again.`,
  }),
  NotLive: () => ({
    title: "The bridge isn't open yet",
    body: "This collection's escrow and Ethereum contract aren't deployed yet. Check back soon.",
  }),
  Network: () => ({
    title: "Can't reach the chains",
    body: "The public endpoints aren't answering. Check your connection and try again in a moment.",
  }),
  Unknown: () => ({
    title: 'Something went wrong',
    body: 'Try again in a moment. If it keeps happening, the details below help us fix it.',
  }),
}

const WALLET_FALLBACK: Readonly<Record<ErrorAction, string>> = {
  send: 'your wallet',
  claim: 'your wallet',
  connect: 'Your wallet',
  read: 'your wallet',
}

/** Kid-friendly headline and body for any error. Non-BridgeErrors are treated as Unknown. */
export function errorCopy(error: unknown, context: ErrorContext): ErrorCopy {
  const e: BridgeError = isBridgeError(error) ? error : toBridgeError(error)
  const tokenId = context.tokenId ?? e.tokenId
  const kid = tokenId === undefined ? 'that kid' : `#${tokenId}`
  const wallet = context.walletName ?? WALLET_FALLBACK[context.action]
  const copy = COPY[e.code]({ kid, wallet, action: context.action })
  const safe = e.code !== 'Unknown' && e.code !== 'Network'
  return { ...copy, safe }
}
