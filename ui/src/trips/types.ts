// Workstream C owns src/trips/. These types are the contract the UI codes against.

import type { Hex } from 'viem'
import type { BridgeError, EthAddress, HubAddress, KidId } from '../chain/types'

/**
 * Where a kid is on its trip. Rebuilt from chain state every time (see derive.ts and PLAN.md's state table).
 * `crossing` means the record exists but the send height Hs is unknown, so stages 2 and 3 can't be told apart.
 */
export type Stage = 'home-hub' | 'locked' | 'catching-up' | 'proving' | 'ready' | 'home-eth' | 'crossing'

/** One kid's journey. */
export interface Trip {
  /** The kid. */
  tokenId: KidId
  /** Where it is now. */
  stage: Stage
  /** Ethereum recipient from the escrow record; null while the kid is still on the Hub. */
  recipient: EthAddress | null
  /** Hub send tx hash, when tx search found it. */
  sendTx?: string
  /** Hs: Hub height of the send, when known. */
  sendHeight?: number
  /** When the send landed. */
  sentAt?: Date
  /** Hub address that sent it. */
  sender?: HubAddress
  /** Current Ethereum owner once minted. Can differ from recipient after a transfer. */
  owner?: EthAddress
  /** catching-up only: Hub blocks until Ethereum's client passes Hs. */
  blocksToGo?: number
  /** proving for more than 30 minutes: the batcher looks stuck. */
  stuck: boolean
}

/** How far behind Ethereum's view of the Hub is. Drives "Ethereum is N min behind" and the paused banner. */
export interface Health {
  /** Latest Hub height. */
  hubHeight: number
  /** Latest Hub height Ethereum's light client has seen. */
  clientHeight: number
  /** hubHeight - clientHeight, never negative. */
  lagBlocks: number
  /** lagBlocks in minutes at the Hub's block time. */
  lagMinutes: number
  /** Light client frozen: sending is disabled site-wide. */
  frozen: boolean
  /** The last refresh failed, so these numbers are old. */
  stale: boolean
}

/** Which trips to find. Fields combine (union). An empty query finds nothing. */
export interface TripQuery {
  /** Every kid whose escrow record points at this Ethereum address. */
  eth?: EthAddress
  /** Every kid this Hub address sent. */
  hub?: HubAddress
  /** These kids, whatever their state. */
  ids?: readonly KidId[]
}

/** A startup sanity check that failed. Any problem hard-disables sending. */
export type ConfigProblem =
  /** the deployment has no escrow or bridge yet */
  | { code: 'NotLive' }
  /** the escrow accepts a different cw721 than the deployment's */
  | { code: 'EscrowCollection'; expected: HubAddress; actual: HubAddress }
  /** bridge.ESCROW() isn't the deployment's escrow */
  | { code: 'BridgeEscrow'; expected: Hex; actual: Hex }

/** Result of the startup sanity check. */
export interface ConfigSanity {
  /** Sending is allowed. Treat "still loading" and "check failed to run" as not ok. */
  ok: boolean
  /** What's wrong, for the visible error. */
  problems: ConfigProblem[]
}

/** A read hook's result. Deliberately smaller than react-query's, so the implementation can change. */
export interface QueryState<T> {
  /** Latest good value. Kept while refetching and after a failed refresh. */
  data: T | undefined
  /** Last failure, or null. */
  error: BridgeError | null
  /** First load: no data yet and a fetch is running. */
  isLoading: boolean
  /** Any fetch is running, including background refreshes. */
  isFetching: boolean
  /** Refetch now. */
  refetch: () => void
}

/** A write hook's result. */
export interface MutationState<Args extends unknown[], Result> {
  /** Runs the write. Rejects with a BridgeError; the same error lands in `error`. */
  run: (...args: Args) => Promise<Result>
  /** idle until run() is called. */
  status: 'idle' | 'pending' | 'success' | 'error'
  /** The last successful result. */
  data: Result | undefined
  /** The last failure, or null. */
  error: BridgeError | null
  /** Back to idle. */
  reset: () => void
}
