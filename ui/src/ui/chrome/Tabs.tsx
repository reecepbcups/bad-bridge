import { useBridge } from '../../chain/context'
import type { RouteName } from '../../router'
import { useTrips } from '../../trips/hooks'
import './Tabs.css'

export type Tab = 'bridge' | 'kids' | 'about'

export function tabOf(route: RouteName): Tab | null {
  if (route === 'bridge' || route === 'about') return route
  if (route === 'kids' || route === 'kid') return 'kids'
  return null
}

const TABS: readonly { tab: Tab; href: string; label: string }[] = [
  { tab: 'bridge', href: '#/', label: 'Bridge a kid' },
  { tab: 'kids', href: '#/kids', label: 'My kids' },
  { tab: 'about', href: '#/about', label: 'About' },
]

/** Top-level sections. Links, not ARIA tabs: each one is its own route. */
export function Tabs({ current }: { current: Tab | null }) {
  const moving = useMovingCount()
  return (
    <nav className="tabs" aria-label="Sections">
      {TABS.map(({ tab, href, label }) => (
        <a key={tab} className="tab" href={href} aria-current={tab === current ? 'page' : undefined}>
          {label}
          {tab === 'kids' && moving > 0 && (
            <span className="badge">
              {moving}
              <span className="sr-only"> on the way</span>
            </span>
          )}
        </a>
      ))}
    </nav>
  )
}

/** Kids headed to the connected Ethereum wallet that aren't home yet. */
function useMovingCount(): number {
  const { ethWallet } = useBridge()
  const trips = useTrips({ eth: ethWallet.status === 'connected' ? ethWallet.address : undefined })
  return trips.data?.filter((t) => t.stage !== 'home-eth' && t.stage !== 'home-hub').length ?? 0
}
