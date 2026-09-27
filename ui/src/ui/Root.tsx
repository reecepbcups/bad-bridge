import { useRoute, type Route } from '../router'
import { Shell } from './chrome/Shell'
import { AboutView } from './views/AboutView'
import { BridgeView } from './views/BridgeView'
import { KidsView } from './views/KidsView'
import { KidView } from './views/KidView'
import { NotFoundView } from './views/NotFoundView'

/** Everything inside the chain provider: the chrome and the view for the current route. */
export function Root() {
  const route = useRoute()
  return (
    <Shell route={route}>
      <RouteView route={route} />
    </Shell>
  )
}

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'bridge':
      return <BridgeView />
    case 'kids':
      return <KidsView address={route.address} />
    case 'kid':
      return <KidView key={route.id} id={route.id} />
    case 'about':
      return <AboutView />
    case 'not-found':
      return <NotFoundView path={route.path} />
  }
}
