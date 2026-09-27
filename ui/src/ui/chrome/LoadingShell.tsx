import { deployment, isLive } from '../../config/deployments'
import { useRoute } from '../../router'
import { ConnectChip, Logo } from './Header'
import { Stepper } from './Stepper'
import { tabOf, TabLinks } from './Tabs'

/** The page's chrome, drawn before the chain code arrives, so the first paint isn't blank and nothing jumps after. */
export function LoadingShell() {
  const route = useRoute()
  return (
    <div className="wrap">
      <header className="header">
        <Logo />
        <div className="wallets">
          <ConnectChip chain="hub" disabled />
          <ConnectChip chain="eth" disabled />
        </div>
      </header>
      <TabLinks current={tabOf(route.name)} />
      {route.name === 'bridge' && isLive(deployment) && <Stepper current={0} />}
      <main id="main" className="card loading-card" aria-busy="true">
        <p className="sr-only" role="status">
          Loading the bridge…
        </p>
      </main>
    </div>
  )
}
