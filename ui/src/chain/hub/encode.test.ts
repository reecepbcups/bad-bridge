import { fromUtf8 } from '@cosmjs/encoding'
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx'
import { Tx } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { describe, expect, it } from 'vitest'
import { isBridgeError, type BridgeErrorCode } from '../types'
import {
  buildNudgeMsg,
  buildSendMsgs,
  checkKidIds,
  decodeRecipient,
  encodeRecipient,
  MSG_EXECUTE_CONTRACT,
  MSG_TRANSFER,
  NUDGE_AMOUNT_UATOM,
  NUDGE_TIMEOUT_MS,
  parseKidId,
  recipientBytes,
  recipientFromHex,
  sendNftMsg,
} from './encode'
import { CW721, ESCROW, RECIPIENT, REECE } from './fixtures'
import { simulationTxBytes } from './writer'

// From mainnet tx 0C72F725E53CD2B4EB6159EA0FF2C0C85DA1B9189FD84BA28DEA6F0071BAC2E5, which bridged ReeceBadTest #2.
const GOLDEN =
  '{"send_nft":{"contract":"cosmos1rce3kmvc2v955f64gp8cjtwqzma3qg8t4puk7swmqd56j25gfqgq3s8037","token_id":"2","msg":"0sOSCEdhy25ExUS2853MAB/el3U="}}'
const GOLDEN_RECIPIENT = '0xd2c392084761cb6e44c544b6f39dcc001fde9775'

function codeOf(fn: () => unknown): BridgeErrorCode | 'no error' {
  try {
    fn()
    return 'no error'
  } catch (e) {
    if (!isBridgeError(e)) throw e
    return e.code
  }
}

describe('golden vector', () => {
  it('encodes recipient 0xd2c3…9775 and token 2 exactly like the mainnet tx', () => {
    expect(JSON.stringify(sendNftMsg(ESCROW, 2, GOLDEN_RECIPIENT))).toBe(GOLDEN)
  })

  it('is exactly the msg bytes of the MsgExecuteContract we build and simulate', () => {
    const [msg] = buildSendMsgs(REECE, CW721, ESCROW, [2], GOLDEN_RECIPIENT)
    expect(msg?.typeUrl).toBe(MSG_EXECUTE_CONTRACT)
    expect(msg?.value.sender).toBe(REECE)
    expect(msg?.value.contract).toBe(CW721)
    expect(msg?.value.funds).toEqual([])
    expect(fromUtf8(msg?.value.msg ?? new Uint8Array())).toBe(GOLDEN)

    // and it survives protobuf: decode the simulated tx and read the message back
    const tx = Tx.decode(simulationTxBytes(buildSendMsgs(REECE, CW721, ESCROW, [2], GOLDEN_RECIPIENT), new Uint8Array(33).fill(2), 27))
    const any = tx.body?.messages[0]
    expect(any?.typeUrl).toBe(MSG_EXECUTE_CONTRACT)
    const decoded = MsgExecuteContract.decode(any?.value ?? new Uint8Array())
    expect(fromUtf8(decoded.msg)).toBe(GOLDEN)
    expect(tx.authInfo?.signerInfos[0]?.sequence).toBe(27n)
  })

  it('round-trips: the msg decodes back to the checksummed recipient', () => {
    const parsed = JSON.parse(GOLDEN) as { send_nft: { msg: string } }
    expect(decodeRecipient(parsed.send_nft.msg)).toBe(RECIPIENT)
    expect(decodeRecipient(encodeRecipient(RECIPIENT))).toBe(RECIPIENT)
    expect(decodeRecipient(encodeRecipient(RECIPIENT.toLowerCase()))).toBe(RECIPIENT)
    expect(decodeRecipient(encodeRecipient(`0x${RECIPIENT.slice(2).toUpperCase()}`))).toBe(RECIPIENT)
    for (let i = 0; i < 50; i++) {
      const hex = `0x${Array.from({ length: 40 }, (_, j) => '0123456789abcdef'[(i * 7 + j * 13) % 16]).join('')}`
      if (/^0x0+$/.test(hex)) continue
      expect(decodeRecipient(encodeRecipient(hex)).toLowerCase()).toBe(hex)
    }
  })

  it('builds one message per kid, in order, all to the cw721', () => {
    const msgs = buildSendMsgs(REECE, CW721, ESCROW, [5, 1, 9000], RECIPIENT)
    expect(msgs.map((m) => (JSON.parse(fromUtf8(m.value.msg)) as { send_nft: { token_id: string } }).send_nft.token_id)).toEqual(['5', '1', '9000'])
    expect(new Set(msgs.map((m) => m.value.contract))).toEqual(new Set([CW721]))
  })
})

describe('buildNudgeMsg', () => {
  it('builds a v2 MsgTransfer: client id as source_channel, 0.001 ATOM, plain 0x receiver, no timeout height', () => {
    const msg = buildNudgeMsg(REECE, '08-wasm-1369', 'uatom', RECIPIENT, 1_000_000)
    expect(msg.typeUrl).toBe(MSG_TRANSFER)
    expect(msg.value).toEqual({
      sourcePort: 'transfer',
      sourceChannel: '08-wasm-1369',
      token: { denom: 'uatom', amount: NUDGE_AMOUNT_UATOM },
      sender: REECE,
      receiver: RECIPIENT,
      timeoutHeight: { revisionNumber: 0n, revisionHeight: 0n },
      timeoutTimestamp: BigInt(Math.floor((1_000_000 + NUDGE_TIMEOUT_MS) / 1000)),
      memo: '',
      encoding: '',
    })
  })

  it('validates the receiver the same way a kid send does', () => {
    expect(codeOf(() => buildNudgeMsg(REECE, '08-wasm-1369', 'uatom', '0x0000000000000000000000000000000000000000', 0))).toBe('ZeroRecipient')
    expect(codeOf(() => buildNudgeMsg(REECE, '08-wasm-1369', 'uatom', 'not-an-address', 0))).toBe('BadRecipient')
  })
})

describe('recipient checks (before anything is simulated)', () => {
  it('takes 0x + 40 hex, lowercase, uppercase or valid EIP-55', () => {
    expect(recipientBytes(RECIPIENT)).toHaveLength(20)
    expect(recipientBytes(RECIPIENT.toLowerCase())).toHaveLength(20)
  })

  it.each([
    ['19 bytes', '0xd2c392084761cb6e44c544b6f39dcc001fde97', 'BadRecipient'],
    ['21 bytes', '0xd2c392084761cb6e44c544b6f39dcc001fde977500', 'BadRecipient'],
    ['no 0x', RECIPIENT.slice(2), 'BadRecipient'],
    ['not hex', '0xz2c392084761cb6e44c544b6f39dcc001fde9775', 'BadRecipient'],
    ['bad EIP-55 checksum', '0xd2C392084761cb6E44c544B6f39dcc001fDe9775', 'BadRecipient'],
    ['empty', '', 'BadRecipient'],
    ['zero address', '0x0000000000000000000000000000000000000000', 'ZeroRecipient'],
  ] as const)('refuses %s', (_, recipient, code) => {
    expect(codeOf(() => recipientBytes(recipient))).toBe(code)
    expect(codeOf(() => buildSendMsgs(REECE, CW721, ESCROW, [1], recipient))).toBe(code)
  })
})

describe('token ids', () => {
  it.each([
    ['7', 7],
    ['0', 0],
    ['4294967295', 4294967295],
    ['07', null],
    ['+7', null],
    [' 7', null],
    ['7 ', null],
    ['4294967296', null],
    ['1e3', null],
    ['-1', null],
    ['', null],
    ['abc', null],
  ] as const)('parseKidId(%j) = %j', (s, want) => {
    expect(parseKidId(s)).toBe(want)
  })

  it('refuses empty lists, non-u32 ids and repeats', () => {
    expect(codeOf(() => checkKidIds([]))).toBe('BadTokenId')
    expect(codeOf(() => checkKidIds([1.5]))).toBe('BadTokenId')
    expect(codeOf(() => checkKidIds([-1]))).toBe('BadTokenId')
    expect(codeOf(() => checkKidIds([4294967296]))).toBe('BadTokenId')
    expect(codeOf(() => checkKidIds([1, 2, 1]))).toBe('BadTokenId')
    expect(codeOf(() => checkKidIds([1, 2, 3]))).toBe('no error')
    // at most 50 kids per send
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
    expect(codeOf(() => checkKidIds(ids(50)))).toBe('no error')
    expect(codeOf(() => checkKidIds(ids(51)))).toBe('TooManyKids')
  })
})

describe('recipientFromHex', () => {
  it('checksums 40-char hex, with or without 0x, and rejects anything else', () => {
    expect(recipientFromHex('d2c392084761cb6e44c544b6f39dcc001fde9775')).toBe(RECIPIENT)
    expect(recipientFromHex('0xd2c392084761cb6e44c544b6f39dcc001fde9775')).toBe(RECIPIENT)
    expect(recipientFromHex('d2c3')).toBeNull()
    expect(recipientFromHex(null)).toBeNull()
    expect(recipientFromHex(42)).toBeNull()
  })
})
