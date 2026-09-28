import { describe, expect, it } from 'vitest'
import { MAX_KIDS_PER_SEND } from '../../../chain/types'
import { findKids, togglePick } from './pick'

const kids = [7, 12, 120, 312, 1200, 9999].map((tokenId) => ({ tokenId }))

describe('findKids', () => {
  it.each([
    ['', [7, 12, 120, 312, 1200, 9999]],
    ['  ', [7, 12, 120, 312, 1200, 9999]],
    ['12', [12, 120, 312, 1200]],
    ['#12', [12, 120, 312, 1200]],
    ['# 12 ', [12, 120, 312, 1200]],
    ['999', [9999]],
    ['5', []],
  ])('%j finds %j', (query, ids) => {
    expect(findKids(kids, query).map((k) => k.tokenId)).toEqual(ids)
  })
})

describe('togglePick', () => {
  it('picks and unpicks, keeping pick order', () => {
    expect(togglePick([], 7)).toEqual({ picked: [7], full: false })
    expect(togglePick([7], 12)).toEqual({ picked: [7, 12], full: false })
    expect(togglePick([7, 12], 7)).toEqual({ picked: [12], full: false })
  })

  it('refuses a pick past the per-send cap, but still lets one go', () => {
    const full = Array.from({ length: MAX_KIDS_PER_SEND }, (_, i) => i + 1)
    expect(MAX_KIDS_PER_SEND).toBe(100)
    expect(togglePick(full, 500)).toEqual({ picked: full, full: true })
    expect(togglePick(full, 1).picked).toHaveLength(MAX_KIDS_PER_SEND - 1)
    expect(togglePick([1, 2], 3, 2)).toEqual({ picked: [1, 2], full: true })
  })
})
