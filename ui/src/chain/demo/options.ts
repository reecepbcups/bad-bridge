import { INSTANT, type DemoOptions } from './sim'

/**
 * Demo options from the query string: `?demo`, or `?demo=paused,disconnected,instant`.
 * paused: clock stopped (stable screenshots). disconnected: no wallets. instant: no artificial delays.
 * many: 150 extra kids in the Hub wallet. notlive: no escrow or bridge yet. wrongchain: Ethereum wallet on another network.
 */
export function demoOptionsFromSearch(search: string): DemoOptions {
  const flags = new Set((new URLSearchParams(search).get('demo') ?? '').split(',').map((f) => f.trim()))
  return {
    paused: flags.has('paused'),
    disconnected: flags.has('disconnected'),
    timeline: flags.has('instant') ? INSTANT : undefined,
    ...(flags.has('many') && { extraKids: 150 }),
    ...(flags.has('notlive') && { notLive: true }),
    ...(flags.has('wrongchain') && { wrongChain: true }),
  }
}
