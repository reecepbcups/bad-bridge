import type { Stage, Trip } from '../trips/types'

// Copy and progress numbers for each trip stage. The stage itself always comes from chain (trips/derive.ts).

/** Pill class and text for list rows. */
export const STAGE_PILL: Readonly<Record<Stage, { className: string; label: string }>> = {
  'home-hub': { className: 'pill', label: 'on the Hub' },
  locked: { className: 'pill crossing', label: 'crossing' },
  'catching-up': { className: 'pill crossing', label: 'crossing' },
  proving: { className: 'pill crossing', label: 'crossing' },
  crossing: { className: 'pill crossing', label: 'crossing' },
  ready: { className: 'pill ready', label: 'ready to claim' },
  'home-eth': { className: 'pill home', label: 'home on Ethereum' },
}

/** One line on where the kid is, from the mockup's stage list. */
export const STAGE_LINE: Readonly<Record<Stage, string>> = {
  'home-hub': 'Still on the Hub',
  locked: 'Locked in the Hub escrow',
  'catching-up': 'Ethereum catches up to the Hub',
  proving: 'Making the proof',
  crossing: 'On the bridge',
  ready: 'Proven, ready to claim',
  'home-eth': 'Home on Ethereum',
}

/** How far along the journey a stage is. Used to find the slowest kid in a group and to place walkers. */
export const STAGE_PROGRESS: Readonly<Record<Stage, number>> = {
  'home-hub': 0,
  locked: 1,
  'catching-up': 2,
  crossing: 2.5,
  proving: 3,
  ready: 4,
  'home-eth': 5,
}

/** Still on the bridge: sent, not yet proven. */
export function inFlight(stage: Stage): boolean {
  return stage === 'locked' || stage === 'catching-up' || stage === 'crossing' || stage === 'proving'
}

/** The least advanced stage in a group of trips (the group moves at its slowest kid's pace). */
export function slowestStage(trips: readonly Trip[]): Stage | null {
  let slowest: Stage | null = null
  for (const t of trips) if (slowest === null || STAGE_PROGRESS[t.stage] < STAGE_PROGRESS[slowest]) slowest = t.stage
  return slowest
}

/** The tracker's four segments: Sent, Seen, Proven, Claimed. Segments before this are done; this one is current. */
export const TRACK_AT: Readonly<Record<Stage, number>> = {
  'home-hub': 0,
  locked: 1,
  'catching-up': 1,
  crossing: 1,
  proving: 2,
  ready: 3,
  'home-eth': 4,
}

export const TRACK_LABELS = ['Sent', 'Seen', 'Proven', 'Claimed'] as const

/** The crossing stage list. Items before this index are done, this one is now. 4 means every item is done. */
export const LIST_AT: Readonly<Record<Stage, number>> = {
  'home-hub': 0,
  locked: 1,
  'catching-up': 1,
  crossing: 1,
  proving: 2,
  ready: 4,
  'home-eth': 4,
}
