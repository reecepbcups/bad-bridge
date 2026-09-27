import { useEffect, type ReactNode } from 'react'
import type { Route } from '../../router'
import { Banners } from './Banners'
import { DevBar } from './DevBar'
import { Footer } from './Footer'
import { Header } from './Header'
import { tabOf, Tabs } from './Tabs'

/** Page chrome around the current view: dev toolbar (demo only), header, banners, tabs, the view, footer. */
export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  // block body on purpose: scrollTo returns a promise in newer browsers, and effects must return a cleanup or nothing
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [route.name])
  return (
    <div className="wrap">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <DevBar route={route} />
      <Header />
      <Banners />
      <Tabs current={tabOf(route.name)} />
      {children}
      <Footer />
    </div>
  )
}
