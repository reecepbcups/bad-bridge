// The bytes of a Hub send. Pure and dependency-light so the golden vector test pins exactly what gets signed.

import { fromBase64, toBase64 } from '@cosmjs/encoding'
import type { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx'
import type { MsgTransfer } from 'cosmjs-types/ibc/applications/transfer/v1/tx'
import { bytesToHex, getAddress, hexToBytes } from 'viem'
import { BridgeError, MAX_KIDS_PER_SEND, type EthAddress, type HubAddress, type KidId } from '../types'

export const MAX_U32 = 4_294_967_295
export const MSG_EXECUTE_CONTRACT = '/cosmwasm.wasm.v1.MsgExecuteContract'
export const MSG_TRANSFER = '/ibc.applications.transfer.v1.MsgTransfer'
/** 0.01 ATOM, in uatom: the speed-up nudge's fixed amount. */
export const NUDGE_AMOUNT_UATOM = '10000'
/** How long the nudge's MsgTransfer stays valid before the Hub refunds it back to the sender. */
export const NUDGE_TIMEOUT_MS = 10 * 60_000

/** A kid id as the escrow accepts it on the Hub: a u32 in canonical decimal ("7", never "07" or "+7"). */
export function parseKidId(s: string): KidId | null {
  if (!/^(0|[1-9]\d{0,9})$/.test(s)) return null
  const n = Number(s)
  return n <= MAX_U32 ? n : null
}

export function isKidId(n: unknown): n is KidId {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_U32
}

/** Rejects an empty list, more than MAX_KIDS_PER_SEND, a non-u32 id or a repeat (the second copy would fail on chain). */
export function checkKidIds(ids: readonly KidId[]): void {
  if (ids.length === 0) throw new BridgeError('BadTokenId', 'no kids to send')
  if (ids.length > MAX_KIDS_PER_SEND) throw new BridgeError('TooManyKids', `${ids.length} kids in one send; the most is ${MAX_KIDS_PER_SEND}`)
  const seen = new Set<KidId>()
  for (const id of ids) {
    if (!isKidId(id)) throw new BridgeError('BadTokenId', `${String(id)} is not a u32 token id`)
    if (seen.has(id)) throw new BridgeError('BadTokenId', `#${id} is in the list twice`, { tokenId: id })
    seen.add(id)
  }
}

/**
 * The 20 raw bytes the escrow records. 0x + 40 hex, EIP-55 checksum when mixed-case, never the zero address:
 * a zero recipient can never be claimed, and the reece-test escrow (code 750) predates the on-chain check.
 */
export function recipientBytes(recipient: string): Uint8Array {
  if (typeof recipient !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    throw new BridgeError('BadRecipient', 'recipient must be 0x followed by 40 hex characters (20 bytes)')
  }
  // all-lower or all-upper carries no checksum; mixed case must match EIP-55 exactly (same rule as checkRecipient)
  const body = recipient.slice(2)
  const mixed = body !== body.toLowerCase() && body !== body.toUpperCase()
  if (mixed && getAddress(recipient) !== recipient) throw new BridgeError('BadRecipient', 'recipient fails its EIP-55 checksum')
  const bytes = hexToBytes(recipient as `0x${string}`)
  if (bytes.length !== 20) throw new BridgeError('BadRecipient', `recipient is ${bytes.length} bytes, not 20`)
  if (bytes.every((b) => b === 0)) throw new BridgeError('ZeroRecipient', 'recipient is the zero address')
  return bytes
}

/** The send_nft `msg`: base64 of the raw 20 recipient bytes. */
export function encodeRecipient(recipient: string): string {
  return toBase64(recipientBytes(recipient))
}

/** Inverse of encodeRecipient, checksummed. Throws on anything but 20 bytes. */
export function decodeRecipient(msg: string): EthAddress {
  const bytes = fromBase64(msg)
  if (bytes.length !== 20) throw new BridgeError('BadRecipient', `msg decodes to ${bytes.length} bytes, not 20`)
  return getAddress(bytesToHex(bytes))
}

/** The cw721 execute message for one kid. Key order is part of the golden vector. */
export function sendNftMsg(escrow: HubAddress, id: KidId, recipient: string) {
  return { send_nft: { contract: escrow, token_id: String(id), msg: encodeRecipient(recipient) } }
}

export interface ExecuteEncodeObject {
  typeUrl: typeof MSG_EXECUTE_CONTRACT
  value: MsgExecuteContract
}

/** One MsgExecuteContract per kid, all to the cw721, in the order given. Validates everything first. */
export function buildSendMsgs(
  sender: HubAddress,
  cw721: HubAddress,
  escrow: HubAddress,
  ids: readonly KidId[],
  recipient: string,
): ExecuteEncodeObject[] {
  checkKidIds(ids)
  recipientBytes(recipient)
  const utf8 = new TextEncoder()
  return ids.map((id) => ({
    typeUrl: MSG_EXECUTE_CONTRACT,
    value: { sender, contract: cw721, msg: utf8.encode(JSON.stringify(sendNftMsg(escrow, id, recipient))), funds: [] },
  }))
}

export interface TransferEncodeObject {
  typeUrl: typeof MSG_TRANSFER
  value: MsgTransfer
}

/**
 * The speed-up nudge: a MsgTransfer of NUDGE_AMOUNT_UATOM to `recipient` over `sourceClientId` (the Hub-side
 * Eureka client for Ethereum, from EthReader.hubClientId()). `sourceChannel` doubles as the client id for a v2
 * (Eureka) transfer; `receiver` is the plain 0x address, the form ICS20Transfer.sol expects on the other end.
 * Encoding is left empty (the transfer module defaults empty to `application/json`, the only encoding a v2
 * transfer supports besides protobuf).
 *
 * timeoutTimestamp is unix *seconds*, not the nanoseconds the field's proto doc describes: that's the v1
 * meaning, but transferV2Packet (ibc-go's apps/transfer/keeper/msg_server.go) hands the same uint64 straight to
 * channel/v2's sendPacket, which reads it with time.Unix(timeoutTimestamp, 0) and refuses anything more than
 * 24h out (ErrInvalidTimeout: "timeout exceeds the maximum expected value"). Nanoseconds here reads as an
 * absurdly far-future timestamp and hits that ceiling. Times out after NUDGE_TIMEOUT_MS and refunds like any
 * IBC transfer.
 */
export function buildNudgeMsg(sender: HubAddress, sourceClientId: string, denom: string, recipient: string, nowMs: number): TransferEncodeObject {
  recipientBytes(recipient) // same validation as a kid send: 20 bytes, checksum, not the zero address
  return {
    typeUrl: MSG_TRANSFER,
    value: {
      sourcePort: 'transfer',
      sourceChannel: sourceClientId,
      token: { denom, amount: NUDGE_AMOUNT_UATOM },
      sender,
      receiver: recipient,
      timeoutHeight: { revisionNumber: 0n, revisionHeight: 0n },
      timeoutTimestamp: BigInt(Math.floor((nowMs + NUDGE_TIMEOUT_MS) / 1000)),
      memo: '',
      encoding: '',
    },
  }
}

/** 20-byte hex from the escrow (record, pending, eth_recipient), checksummed. null if it isn't exactly that. */
export function recipientFromHex(hex: unknown): EthAddress | null {
  if (typeof hex !== 'string' || !/^(0x)?[0-9a-fA-F]{40}$/.test(hex)) return null
  return getAddress(`0x${hex.replace(/^0x/, '')}`)
}
