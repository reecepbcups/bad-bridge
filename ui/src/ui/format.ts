// Small display helpers shared by views. Pure, so they're easy to test.

import type { KidId, SendEstimate } from '../chain/types'

/** "cosmos1q8m…3fxl" / "0x8f3a…c21d": enough to recognise, short enough for a chip. */
export function shortAddress(address: string): string {
  const head = address.startsWith('0x') ? 6 : address.indexOf('1') + 4
  return address.length > head + 6 ? `${address.slice(0, head)}…${address.slice(-4)}` : address
}

/** "0C72F7…E2F5": a tx hash short enough for a link. */
export function shortHash(hash: string): string {
  const body = hash.startsWith('0x') ? hash.slice(2) : hash
  const prefix = hash.startsWith('0x') ? '0x' : ''
  return body.length > 12 ? `${prefix}${body.slice(0, 6)}…${body.slice(-4)}` : hash
}

export function kidWord(n: number): string {
  return n === 1 ? 'kid' : 'kids'
}

/** "#9176", "#9176 & #6413", "#9176, #6413 & #663". */
export function kidList(ids: readonly KidId[]): string {
  const tags = ids.map((id) => `#${id}`)
  if (tags.length <= 1) return tags.join('')
  return `${tags.slice(0, -1).join(', ')} & ${tags.at(-1)}`
}

/**
 * A fee in the display unit: uatom → ATOM (6 decimals), trimmed to what matters.
 * "≈ 0.00175 ATOM". Unknown denoms are shown raw.
 */
export function formatFee(fee: Pick<SendEstimate, 'amount' | 'denom'>): string {
  const micro = /^u[a-z]+$/.test(fee.denom)
  if (!micro) return `${fee.amount} ${fee.denom}`
  const value = Number(fee.amount) / 1e6
  const symbol = fee.denom.slice(1).toUpperCase()
  if (!Number.isFinite(value)) return `${fee.amount} ${fee.denom}`
  const text = value === 0 ? '0' : value < 0.000001 ? '< 0.000001' : trimZeros(value.toFixed(6))
  return `${text} ${symbol}`
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

/** "less than a minute", "about 10 min", "about 2 hours". */
export function aboutMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 1) return 'less than a minute'
  if (minutes < 90) return `about ${Math.round(minutes)} min`
  const hours = Math.round(minutes / 60)
  return `about ${hours} hours`
}

/** "just now", "4 min ago", "3 hours ago", "Sep 23". `now` is chain time where it matters. */
export function timeAgo(then: Date, now: Date = new Date()): string {
  const ms = now.getTime() - then.getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hours = Math.floor(min / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  return shortDate(then)
}

/** "Sep 23". */
export function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Sep 26, 9:12 pm". */
export function dateTime(d: Date): string {
  const date = shortDate(d)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return `${date}, ${time}`
}

/** "33,114,902". */
export function blockNumber(n: number): string {
  return n.toLocaleString('en-US')
}

/** "1 block" / "12 blocks". */
export function blocks(n: number): string {
  return n === 1 ? '1 block' : `${blockNumber(n)} blocks`
}
