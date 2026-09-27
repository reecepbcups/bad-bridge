import { INSTANT, type DemoOptions } from './sim'

/**
 * Demo options from the query string: `?demo`, or `?demo=paused,disconnected,instant`.
 * paused: clock stopped (stable screenshots). disconnected: no wallets. instant: no artificial delays.
 */
export function demoOptionsFromSearch(search: string): DemoOptions {
  const flags = new Set((new URLSearchParams(search).get('demo') ?? '').split(',').map((f) => f.trim()))
  return {
    paused: flags.has('paused'),
    disconnected: flags.has('disconnected'),
    timeline: flags.has('instant') ? INSTANT : undefined,
  }
}
