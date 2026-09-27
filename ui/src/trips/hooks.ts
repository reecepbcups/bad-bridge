// Workstream C owns this file. Phase 0 ships naive but working versions over useBridge() and react-query,
// good enough for the demo; hardening must keep these signatures.

import { fromBech32 } from '@cosmjs/encoding'
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { bytesToHex } from 'viem'
import { useBridge } from '../chain/context'
import {
  BridgeError,
  toBridgeError,
  type ClaimResult,
  type EscrowRecord,
  type EthAddress,
  type EthReader,
  type HubReader,
  type KidId,
  type SendEstimate,
  type SendInfo,
  type SendResult,
} from '../chain/types'
import { isLive } from '../config/deployments'
import { blocksToGo, deriveStage, isStuck, STAGE_ORDER } from './derive'
import { rememberedTrips, rememberTrips, subscribeRemembered } from './storage'
import type { ConfigProblem, ConfigSanity, Health, MutationState, QueryState, Trip, TripQuery } from './types'

/** How often trips and health refresh on their own. */
export const POLL_MS = 30_000

/** The connected Hub wallet's kids: still-home ones first (ascending), then the ones it sent, with their stages. */
export function useOwnedKids(): QueryState<Trip[]> {
  const { deployment, hub, eth, hubWallet } = useBridge()
  const owner = hubWallet.status === 'connected' ? hubWallet.address : undefined
  return toQueryState(
    useQuery({
      queryKey: ['bridge', deployment.id, 'owned', owner],
      enabled: owner !== undefined,
      refetchInterval: POLL_MS,
      queryFn: async () => {
        if (!owner) return []
        const [owned, sends] = await Promise.all([hub.ownedKids(owner), isLive(deployment) ? hub.sendsBy(owner) : []])
        const home: Trip[] = owned.map((tokenId) => ({ tokenId, stage: 'home-hub', recipient: null, stuck: false }))
        const known = knownFromSends(sends)
        const sent = await loadTrips(hub, eth, [...known.keys()], known)
        return [...home, ...sent.sort((a, b) => (b.sendHeight ?? 0) - (a.sendHeight ?? 0))]
      },
    }),
  )
}

/** Trips matching any part of `query`, ready ones first. */
export function useTrips(query: TripQuery): QueryState<Trip[]> {
  const { deployment, hub, eth } = useBridge()
  const ethKey = query.eth?.toLowerCase()
  const idsKey = query.ids ? [...query.ids].sort((a, b) => a - b).join(',') : undefined
  return toQueryState(
    useQuery({
      queryKey: ['bridge', deployment.id, 'trips', ethKey, query.hub, idsKey],
      enabled: Boolean(query.eth || query.hub || query.ids?.length),
      refetchInterval: POLL_MS,
      queryFn: async () => {
        const known = new Map<KidId, Known>()
        const ids = new Set(query.ids ?? [])
        if (query.eth && ethKey) {
          for (const r of await hub.allRecords()) {
            if (r.recipient.toLowerCase() === ethKey) {
              ids.add(r.tokenId)
              known.set(r.tokenId, { record: r })
            }
          }
        }
        if (query.hub) {
          for (const [id, k] of knownFromSends(await hub.sendsBy(query.hub))) {
            ids.add(id)
            known.set(id, { ...known.get(id), ...k })
          }
        }
        const trips = await loadTrips(hub, eth, [...ids], known)
        return trips.sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || (b.sendHeight ?? 0) - (a.sendHeight ?? 0))
      },
    }),
  )
}

/** One kid's trip, whatever its state (a kid that never left is `home-hub`). */
export function useTrip(id: KidId): QueryState<Trip> {
  const { deployment, hub, eth } = useBridge()
  return toQueryState(
    useQuery({
      queryKey: ['bridge', deployment.id, 'trip', id],
      refetchInterval: POLL_MS,
      queryFn: async () => {
        const [trip] = await loadTrips(hub, eth, [id])
        if (!trip) throw new BridgeError('Unknown', `no trip for #${id}`)
        return trip
      },
    }),
  )
}

/** How far behind Ethereum's view of the Hub is, and whether the client is frozen. */
export function useHealth(): QueryState<Health> {
  const { deployment, hub, eth } = useBridge()
  const q = useQuery({
    queryKey: ['bridge', deployment.id, 'health'],
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<Health> => {
      const [latest, client] = await Promise.all([hub.latestBlock(), eth.client()])
      const lagBlocks = Math.max(0, latest.height - client.latestHeight)
      return {
        hubHeight: latest.height,
        clientHeight: client.latestHeight,
        lagBlocks,
        lagMinutes: (lagBlocks * deployment.hub.blockSeconds) / 60,
        frozen: client.frozen,
        stale: false,
      }
    },
  })
  const state = toQueryState(q)
  // a failed refresh keeps the old numbers; say so
  return q.data && q.isError ? { ...state, data: { ...q.data, stale: true } } : state
}

/** Sends kids from the connected Hub wallet in one tx, then remembers them locally. */
export function useSendKids(): MutationState<[ids: readonly KidId[], recipient: EthAddress], SendResult> {
  const { deployment, hubWriter } = useBridge()
  const queryClient = useQueryClient()
  return toMutationState(
    useMutation({
      mutationFn: async ([ids, recipient]: [readonly KidId[], EthAddress]) => {
        if (!hubWriter) throw new BridgeError('Unknown', 'Hub wallet not connected')
        return hubWriter.send(ids, recipient)
      },
      onSuccess: (_result, [ids]) => {
        rememberTrips(deployment.id, ids)
        void queryClient.invalidateQueries({ queryKey: ['bridge', deployment.id] })
      },
    }),
  )
}

/** Claims proven kids from the connected Ethereum wallet (one tx for any number). */
export function useClaimKids(): MutationState<[ids: readonly KidId[]], ClaimResult> {
  const { deployment, ethWriter } = useBridge()
  const queryClient = useQueryClient()
  return toMutationState(
    useMutation({
      mutationFn: async ([ids]: [readonly KidId[]]) => {
        if (!ethWriter) throw new BridgeError('Unknown', 'Ethereum wallet not connected')
        return ethWriter.claim(ids)
      },
      onSuccess: (_result, [ids]) => {
        rememberTrips(deployment.id, ids)
        void queryClient.invalidateQueries({ queryKey: ['bridge', deployment.id] })
      },
    }),
  )
}

/** Simulates sending `ids` to `recipient` from the connected Hub wallet. Idle until all three exist. */
export function useSendEstimate(ids: readonly KidId[], recipient: EthAddress | null): QueryState<SendEstimate> {
  const { deployment, hubWriter } = useBridge()
  return toQueryState(
    useQuery({
      queryKey: ['bridge', deployment.id, 'estimate', hubWriter?.address, ids.join(','), recipient],
      enabled: hubWriter !== null && ids.length > 0 && recipient !== null,
      retry: false,
      staleTime: 30_000,
      queryFn: async () => {
        if (!hubWriter || !recipient) throw new BridgeError('Unknown', 'nothing to simulate')
        return hubWriter.simulateSend(ids, recipient)
      },
    }),
  )
}

/** The startup check: the escrow accepts our cw721, and the bridge trusts our escrow. Sending needs data.ok. */
export function useConfigSanity(): QueryState<ConfigSanity> {
  const { deployment, hub, eth } = useBridge()
  return toQueryState(
    useQuery({
      queryKey: ['bridge', deployment.id, 'sanity'],
      staleTime: Infinity,
      queryFn: async (): Promise<ConfigSanity> => {
        const escrow = deployment.hub.escrow
        if (!escrow || !isLive(deployment)) return { ok: false, problems: [{ code: 'NotLive' }] }
        const [cw721, bridgeEscrow] = await Promise.all([hub.escrowCw721(), eth.bridgeEscrow()])
        const problems: ConfigProblem[] = []
        if (cw721 !== deployment.hub.cw721) {
          problems.push({ code: 'EscrowCollection', expected: deployment.hub.cw721, actual: cw721 })
        }
        const expected = bytesToHex(fromBech32(escrow).data)
        if (bridgeEscrow.toLowerCase() !== expected.toLowerCase()) {
          problems.push({ code: 'BridgeEscrow', expected, actual: bridgeEscrow })
        }
        return { ok: problems.length === 0, problems }
      },
    }),
  )
}

/** Kids this browser sent or claimed, oldest first. */
export function useRememberedTrips(): KidId[] {
  const { deployment } = useBridge()
  return useSyncExternalStore(subscribeRemembered, () => rememberedTrips(deployment.id))
}

// ---- internals ----

interface Known {
  record?: EscrowRecord | null
  send?: SendInfo | null
}

function knownFromSends(sends: readonly SendInfo[]): Map<KidId, Known> {
  return new Map(sends.map((s) => [s.tokenId, { send: s, record: { tokenId: s.tokenId, recipient: s.recipient } }]))
}

/** Reads everything deriveStage needs for each kid and builds its Trip. `known` skips reads already done. */
async function loadTrips(
  hub: HubReader,
  eth: EthReader,
  ids: readonly KidId[],
  known: ReadonlyMap<KidId, Known> = new Map(),
): Promise<Trip[]> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return []
  const [latest, client, statuses, facts] = await Promise.all([
    hub.latestBlock(),
    eth.client(),
    eth.kidStatus(unique),
    Promise.all(
      unique.map(async (id) => {
        const k = known.get(id)
        const record = k?.record !== undefined ? k.record : await hub.record(id)
        const send = !record ? null : k?.send !== undefined ? k.send : await hub.sendInfo(id)
        const sentAt = send ? (send.time ?? (await hub.block(send.height)).time) : undefined
        return { id, record, send, sentAt }
      }),
    ),
  ])

  // a lower bound on when the client passed Hs: the time of the newest Hub block Ethereum has seen
  const proving = facts.some(({ record, send, id }) =>
    deriveStage({ record, sendHeight: send?.height ?? null, client, eth: statuses.get(id) ?? null }) === 'proving',
  )
  const since = proving ? (await hub.block(client.latestHeight)).time : null

  return facts.map(({ id, record, send, sentAt }) => {
    const status = statuses.get(id) ?? null
    const stage = deriveStage({ record, sendHeight: send?.height ?? null, client, eth: status })
    const trip: Trip = {
      tokenId: id,
      stage,
      recipient: record?.recipient ?? status?.proven ?? null,
      stuck: isStuck(stage, since, latest.time),
    }
    if (send) {
      trip.sendTx = send.txHash
      trip.sendHeight = send.height
      trip.sender = send.sender
    }
    if (sentAt) trip.sentAt = sentAt
    if (status?.owner) trip.owner = status.owner
    if (stage === 'catching-up' && send) trip.blocksToGo = blocksToGo(send.height, client.latestHeight)
    return trip
  })
}

function toQueryState<T>(q: UseQueryResult<T>): QueryState<T> {
  return {
    data: q.data,
    error: q.error ? toBridgeError(q.error) : null,
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
