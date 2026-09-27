import type { Stage } from '../trips/types'

// Copy for each stage. Phase 0 placeholders based on the mockup; the UI workstream owns the wording.

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
