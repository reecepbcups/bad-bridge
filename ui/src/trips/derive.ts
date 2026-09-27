import type { ClientStatus, EscrowRecord, KidEthStatus } from '../chain/types'
import type { Stage } from './types'

/** Proving longer than this and the batcher "looks stuck". */
export const STUCK_AFTER_MS = 30 * 60_000

/** Chain facts about one kid. null means unknown (not found, or the read failed). */
export interface StageInput {
  /** Escrow record; null if the kid never left the Hub. */
  record: EscrowRecord | null
  /** Hs, the send height; null if tx search couldn't find it. */
  sendHeight: number | null
  /** Ethereum's light client of the Hub. */
  client: ClientStatus | null
  /** proven / ownerOf on Ethereum. */
  eth: KidEthStatus | null
}

/**
 * PLAN.md's state table, in priority order. Minted beats everything; proven beats the Hub-side checks.
 * The client must pass Hs (latestHeight > Hs) because the batcher proves at H-1 and the record is in state after Hs.
 */
export function deriveStage({ record, sendHeight, client, eth }: StageInput): Stage {
  if (eth?.owner) return 'home-eth'
  if (eth?.proven) return 'ready'
  if (!record) return 'home-hub'
  if (sendHeight === null) return 'crossing'
  if (!client) return 'locked'
  if (client.latestHeight <= sendHeight) return 'catching-up'
  return 'proving'
}

/** catching-up: Hub blocks until the client passes Hs. */
export function blocksToGo(sendHeight: number, clientHeight: number): number {
  return Math.max(0, sendHeight + 1 - clientHeight)
}

/** proving since `since` for longer than STUCK_AFTER_MS, measured on chain time. */
export function isStuck(stage: Stage, since: Date | null, now: Date): boolean {
  return stage === 'proving' && since !== null && now.getTime() - since.getTime() > STUCK_AFTER_MS
}

/** Sort order for lists: ready first (there's something to do), then in flight, then done. */
export const STAGE_ORDER: Readonly<Record<Stage, number>> = {
  ready: 0,
  proving: 1,
  crossing: 2,
  'catching-up': 3,
  locked: 4,
  'home-eth': 5,
  'home-hub': 6,
}
