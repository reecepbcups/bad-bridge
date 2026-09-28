import { MAX_KIDS_PER_SEND, type KidId } from '../../../chain/types'

// Pick-screen rules, pure so they're easy to test.

/** Wallets holding more kids than this get a "find" box above the grid. */
export const FIND_FROM = 12

/** The kids whose number contains what was typed ("#12", "12" and " 12 " all find #120 and #312). */
export function findKids<T extends { tokenId: KidId }>(kids: readonly T[], query: string): readonly T[] {
  const digits = query.replace(/[#\s]/g, '')
  if (!digits) return kids
  return kids.filter((k) => String(k.tokenId).includes(digits))
}

/** Picks or unpicks `id`. A pick past `max` is refused (`full`), since one send carries at most that many kids. */
export function togglePick(
  picked: readonly KidId[],
  id: KidId,
  max: number = MAX_KIDS_PER_SEND,
): { picked: readonly KidId[]; full: boolean } {
  if (picked.includes(id)) return { picked: picked.filter((p) => p !== id), full: false }
  if (picked.length >= max) return { picked, full: true }
  return { picked: [...picked, id], full: false }
}
