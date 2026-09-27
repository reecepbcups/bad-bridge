// Workstream C: the trip hooks. Signatures here are the contract the UI codes against.
//
// Every hook reads chain state through useBridge() and react-query. Hook queries poll (30s, or 10s with
// { live: true }); the chain reads underneath are shared between hooks and cached by how much they can change
// (see keys.ts). A failure that doesn't stop a hook, like Ethereum being down while the Hub answers, comes back
// in QueryState.error beside the data that did load.

import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import { useMemo, useSyncExternalStore } from 'react'
import { useBridge } from '../chain/context'
import {
  BridgeError,
  toBridgeError,
  type ClaimResult,
  type EthAddress,
  type KidId,
  type SendEstimate,
  type SendInfo,
  type SendResult,
} from '../chain/types'
import { isLive } from '../config/deployments'
import { compareTrips, isFinal } from './derive'
import { idsKey, isKidId, discoverTrips, loadHealth, loadOwned, loadTrips, seededTrip, sortOwned, type Ctx, type WithError } from './load'
import { keys, LIVE_POLL_MS, POLL_MS, type TripQueryKey } from './keys'
import { checkConfig, notLive } from './sanity'
import { rememberedTrips, rememberTrips, subscribeRemembered } from './storage'
import type { ConfigSanity, Health, MutationState, QueryState, Trip, TripOptions, TripQuery } from './types'

export { LIVE_POLL_MS, POLL_MS } from './keys'
export { describeConfigProblem } from './sanity'

/**
 * The connected Hub wallet's kids, for the pick screen: still-home ones first (ascending, stage `home-hub`),
 * then every kid it sent, with its current stage (ready first, then in flight, then home on Ethereum), so
 * they can show disabled. Idle (no data) until a Hub wallet is connected.
 */
export function useOwnedKids(): QueryState<Trip[]> {
  const ctx = useCtx()
  const { hubWallet } = useBridge()
  const owner = hubWallet.status === 'connected' ? hubWallet.address : undefined
  const q = useQuery({
    queryKey: keys.owned(ctx.deployment.id, owner),
    enabled: owner !== undefined,
    refetchInterval: POLL_MS,
    queryFn: () => (owner ? loadOwned(ctx, owner, isLive(ctx.deployment)) : Promise.resolve({ value: [], error: null })),
  })
  return useTripsState(ctx, q)
}

/**
 * Trips matching any part of `query` (union, deduped by kid): ready first, then in flight, then home, newest
 * send first within each. An empty query finds nothing and stays idle.
 * - `eth`: every escrow record for that recipient (case-insensitive), plus kids this browser sent there.
 * - `hub`: every send by that Hub address, plus kids this browser sent from it.
 * - `ids`: those kids, whatever their state.
 * Polls every 30s (10s with `live`). A query for `ids` alone stops polling once every kid is home on Ethereum.
 */
export function useTrips(query: TripQuery, options?: TripOptions): QueryState<Trip[]> {
  const ctx = useCtx()
  const key = normalizeQuery(query)
  const discovering = Boolean(key.eth || key.hub)
  const interval = options?.live ? LIVE_POLL_MS : POLL_MS
  const q = useQuery({
    queryKey: keys.trips(ctx.deployment.id, key),
    enabled: Boolean(key.eth || key.hub || key.ids),
    refetchInterval: (query) => {
      const trips = query.state.data?.value
      // a lookup can always find new kids; a fixed set of kids is done once they're all home
      return !discovering && trips?.length && trips.every((t) => isFinal(t.stage)) ? false : interval
    },
    queryFn: () => discoverTrips(ctx, key),
  })
  return useTripsState(ctx, q)
}

/**
 * One kid's trip, whatever its state (a kid that never left is `home-hub`). Polls every 30s (10s with `live`)
 * and stops once it's home on Ethereum. A malformed id fails with BadTokenId.
 */
export function useTrip(id: KidId, options?: TripOptions): QueryState<Trip> {
  const ctx = useCtx()
  const interval = options?.live ? LIVE_POLL_MS : POLL_MS
  const q = useQuery({
    queryKey: keys.trip(ctx.deployment.id, id),
    ...(isKidId(id) ? {} : { retry: false }),
    refetchInterval: (query) => (query.state.data && isFinal(query.state.data.value.stage) ? false : interval),
    queryFn: async (): Promise<WithError<Trip>> => {
      if (!isKidId(id)) throw new BridgeError('BadTokenId', String(id), { tokenId: id })
      const { value, error } = await loadTrips(ctx, [id])
      const [trip] = value
      if (!trip) throw new BridgeError('Unknown', `no trip for #${id}`, { tokenId: id })
      return { value: trip, error }
    },
  })
  return { ...toQueryState(q), refetch: () => refetchNow(ctx, q, [keys.kid(ctx.deployment.id, id), keys.client(ctx.deployment.id)]) }
}

/**
 * How far behind Ethereum's view of the Hub is, whether the client is frozen, and whether to trust it.
 * lagMinutes uses the Hub's block time measured over the last 1000 blocks (cached for an hour; the
 * deployment's ~6s if it can't be measured). A failed read keeps the last numbers with stale: true and
 * the failure in error. Polls every 30s (10s with `live`).
 */
export function useHealth(options?: TripOptions): QueryState<Health> {
  const ctx = useCtx()
  const q = useQuery({
    queryKey: keys.health(ctx.deployment.id),
    refetchInterval: options?.live ? LIVE_POLL_MS : POLL_MS,
    queryFn: () => loadHealth(ctx),
  })
  const d = ctx.deployment.id
  const state = { ...toQueryState(q), refetch: () => refetchNow(ctx, q, [keys.client(d), keys.latest(d)]) }
  // a whole refresh failed: the old numbers are still shown, so say they're old
  return state.data && q.isError ? { ...state, data: { ...state.data, stale: true } } : state
}

/**
 * Sends kids from the connected Hub wallet in one tx. Once it lands:
 * - remembers them in this browser (ids, tx hash, height, recipient, sender, time), best effort;
 * - seeds the cache, so useTrip(id) and useTrips({ ids }) for the sent kids show them at once with Hs known
 *   (`catching-up`, or `locked` if Ethereum's client hasn't been read yet), and the pick screen shows them sent;
 * - refreshes owned kids and every trip list.
 * Rejects with a BridgeError; bookkeeping after a successful send never makes it reject.
 */
export function useSendKids(): MutationState<[ids: readonly KidId[], recipient: EthAddress], SendResult> {
  const ctx = useCtx()
  const { hubWriter } = useBridge()
  return toMutationState(
    useMutation({
      mutationFn: async ([ids, recipient]: [readonly KidId[], EthAddress]) => {
        if (!hubWriter) throw new BridgeError('Unknown', 'Hub wallet not connected')
        if (ids.length === 0) throw new BridgeError('Unknown', 'no kids picked')
        const result = await hubWriter.send(ids, recipient)
        try {
          afterSend(ctx, hubWriter.address, [...new Set(ids)], recipient, result)
        } catch {
          // the kids are on their way whatever happens here; the next poll finds them
        }
        return result
      },
    }),
  )
}

/**
 * Claims proven kids from the connected Ethereum wallet (one tx for any number). Once mined, the claimed kids
 * show as home at once (owner = their recipient), and every trip is re-read to confirm.
 */
export function useClaimKids(): MutationState<[ids: readonly KidId[]], ClaimResult> {
  const ctx = useCtx()
  const { ethWriter } = useBridge()
  return toMutationState(
    useMutation({
      mutationFn: async ([ids]: [readonly KidId[]]) => {
        if (!ethWriter) throw new BridgeError('Unknown', 'Ethereum wallet not connected')
        if (ids.length === 0) throw new BridgeError('Unknown', 'no kids to claim')
        const result = await ethWriter.claim(ids)
        try {
          afterClaim(ctx, [...new Set(ids)])
        } catch {
          // minted either way; the next poll shows it
        }
        return result
      },
    }),
  )
}

/** Simulates sending `ids` to `recipient` from the connected Hub wallet. Idle until all three exist. */
export function useSendEstimate(ids: readonly KidId[], recipient: EthAddress | null): QueryState<SendEstimate> {
  const { deployment, hubWriter } = useBridge()
  const key = idsKey(ids)
  return toQueryState(
    useQuery({
      queryKey: keys.estimate(deployment.id, hubWriter?.address, key, recipient),
      enabled: hubWriter !== null && key !== '' && recipient !== null,
      retry: false,
      staleTime: 30_000,
      gcTime: 60_000,
      queryFn: async (): Promise<WithError<SendEstimate>> => {
        if (!hubWriter || !recipient || !key) throw new BridgeError('Unknown', 'nothing to simulate')
        return { value: await hubWriter.simulateSend(key.split(',').map(Number), recipient), error: null }
      },
    }),
  )
}

/**
 * The startup check behind Send: the escrow accepts our cw721, and bridge.ESCROW() is our escrow (32 bytes).
 * Send only when data?.ok === true: no data (loading), `unknown` (a read failed; error says why, re-checked
 * every 30s), `mismatch` and `not-live` all mean no. A definitive answer is cached for the session.
 */
export function useConfigSanity(): QueryState<ConfigSanity> {
  const { deployment, hub, eth } = useBridge()
  return toQueryState(
    useQuery({
      queryKey: keys.sanity(deployment.id),
      staleTime: Infinity,
      retry: false,
      refetchInterval: (query) => (query.state.data?.value.status === 'unknown' ? POLL_MS : false),
      queryFn: async (): Promise<WithError<ConfigSanity>> => {
        if (!deployment.hub.escrow || !isLive(deployment)) return { value: notLive(), error: null }
        try {
          const [cw721, bridgeEscrow] = await Promise.all([hub.escrowCw721(), eth.bridgeEscrow()])
          return { value: checkConfig(deployment, cw721, bridgeEscrow), error: null }
        } catch (e) {
          const error = toBridgeError(e)
          if (error.code === 'NotLive') return { value: notLive(), error: null }
          // couldn't read: that proves nothing either way, so it's not ok and not a mismatch
          return { value: { ok: false, status: 'unknown', problems: [] }, error }
        }
      },
    }),
  )
}

/** Kids this browser sent or claimed, oldest first. Survives reloads when storage works; never required. */
export function useRememberedTrips(): KidId[] {
  const { deployment } = useBridge()
  return useSyncExternalStore(subscribeRemembered, () => rememberedTrips(deployment.id))
}

// ---- internals ----

function useCtx(): Ctx {
  const { deployment, hub, eth } = useBridge()
  const qc = useQueryClient()
  return useMemo(() => ({ qc, deployment, hub, eth }), [qc, deployment, hub, eth])
}

function normalizeQuery(query: TripQuery): TripQueryKey {
  const key: TripQueryKey = {}
  const eth = query.eth?.trim().toLowerCase()
  const hub = query.hub?.trim()
  const ids = query.ids ? idsKey(query.ids) : ''
  if (eth) key.eth = eth
  if (hub) key.hub = hub
  if (ids) key.ids = ids
  return key
}

/** QueryState for a trip list; refetch() also re-reads minted kids' owners, which polls skip. */
function useTripsState(ctx: Ctx, q: UseQueryResult<WithError<Trip[]>>): QueryState<Trip[]> {
  const d = ctx.deployment.id
  return { ...toQueryState(q), refetch: () => refetchNow(ctx, q, [keys.kidAll(d), keys.client(d)]) }
}

/** An explicit refetch means now: the shared reads it depends on are re-read even if a hook just read them. */
function refetchNow(ctx: Ctx, q: UseQueryResult<unknown>, reads: readonly (readonly unknown[])[]): void {
  for (const queryKey of reads) void ctx.qc.invalidateQueries({ queryKey, refetchType: 'none' })
  void q.refetch()
}

function afterSend(ctx: Ctx, sender: string, ids: readonly KidId[], recipient: EthAddress, result: SendResult): void {
  const { qc, deployment } = ctx
  const d = deployment.id
  const now = Date.now()
  rememberTrips(
    d,
    ids.map((id) => ({ id, txHash: result.txHash, height: result.height, recipient, sender, sentAt: now })),
  )

  // the record and the send are facts now, and immutable: seed them so no read has to find them
  const trips = ids.map((id) => {
    const send: SendInfo = { tokenId: id, txHash: result.txHash, height: result.height, sender, recipient }
    qc.setQueryData(keys.record(d, id), { tokenId: id, recipient })
    qc.setQueryData(keys.send(d, id), send)
    return seededTrip(ctx, id, send, new Date(now))
  })
  for (const trip of trips) qc.setQueryData<WithError<Trip>>(keys.trip(d, trip.tokenId), { value: trip, error: null })
  qc.setQueryData<WithError<Trip[]>>(keys.trips(d, { ids: idsKey(ids) }), { value: [...trips].sort(compareTrips), error: null })
  replaceTrips(qc, keys.owned(d, sender), trips, sortOwned)

  // everything that lists kids re-reads; the reads seeded above stay put
  invalidate(qc, [keys.ownedKidsAll(d), keys.sendsByAll(d), keys.records(d)], [keys.tripsAll(d), keys.tripAll(d), keys.ownedAll(d)])
}

function afterClaim(ctx: Ctx, ids: readonly KidId[]): void {
  const { qc, deployment } = ctx
  const d = deployment.id
  rememberTrips(d, ids)
  const claimed = new Set(ids)
  // minted to the proven recipient; the refresh below confirms (a kid that somehow wasn't flips back)
  const flip = (t: Trip): Trip =>
    claimed.has(t.tokenId) && t.stage === 'ready' && t.recipient ? { ...t, stage: 'home-eth', owner: t.recipient, stuck: false } : t
  qc.setQueriesData<WithError<Trip[]>>({ queryKey: keys.tripsAll(d) }, (old) =>
    old ? { ...old, value: old.value.map(flip).sort(compareTrips) } : old,
  )
  qc.setQueriesData<WithError<Trip[]>>({ queryKey: keys.ownedAll(d) }, (old) =>
    old ? { ...old, value: sortOwned(old.value.map(flip)) } : old,
  )
  for (const id of ids) qc.setQueryData<WithError<Trip>>(keys.trip(d, id), (old) => (old ? { ...old, value: flip(old.value) } : old))
  invalidate(
    qc,
    ids.map((id) => keys.kid(d, id)),
    [keys.tripsAll(d), keys.tripAll(d), keys.ownedAll(d)],
  )
}

/** Puts `trips` into a cached list in place of the same kids, keeping the list's order rule. */
function replaceTrips(qc: QueryClient, key: readonly unknown[], trips: readonly Trip[], sort: (t: readonly Trip[]) => Trip[]): void {
  const byId = new Map(trips.map((t) => [t.tokenId, t]))
  qc.setQueryData<WithError<Trip[]>>(key, (old) => {
    if (!old) return old
    const rest = old.value.filter((t) => !byId.has(t.tokenId))
    return { ...old, value: sort([...rest, ...trips]) }
  })
}

/**
 * Marks raw reads stale first, then refetches the hook queries. Order matters: an active hook query refetches
 * synchronously on invalidation, and would reuse a raw read that isn't marked yet.
 */
function invalidate(qc: QueryClient, reads: readonly (readonly unknown[])[], hookQueries: readonly (readonly unknown[])[]): void {
  for (const queryKey of reads) void qc.invalidateQueries({ queryKey, refetchType: 'none' })
  for (const queryKey of hookQueries) void qc.invalidateQueries({ queryKey })
}

function toQueryState<T>(q: UseQueryResult<WithError<T>>): QueryState<T> {
  return {
    data: q.data?.value,
    error: q.error ? toBridgeError(q.error) : (q.data?.error ?? null),
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    refetch: () => void q.refetch(),
  }
}

function toMutationState<Args extends unknown[], Result>(
  m: UseMutationResult<Result, Error, Args>,
): MutationState<Args, Result> {
  return {
    run: (...args) => m.mutateAsync(args).catch((e: unknown) => Promise.reject(toBridgeError(e))),
    status: m.status,
    data: m.data,
    error: m.error ? toBridgeError(m.error) : null,
    reset: m.reset,
  }
}
