import './Banners.css'

/** On top of every page of the demo, so nobody mistakes the sim for their real kids. */
export function DemoBanner() {
  return (
    <aside className="demo-banner" aria-label="Demo mode">
      <b>DEMO:</b> not real chain data
      {/* COPY: demo banner */}
    </aside>
  )
}
