import type { Deployment } from '../config/deployments'
import './chrome/Header.css'

/** Shown when the chain provider itself fails, so there's no wallet state to draw the normal chrome with. */
export function Broken({ error, deployment }: { error: Error; deployment: Deployment }) {
  const unwired = /not implemented yet/.test(error.message)
  return (
    <div className="wrap">
      <header className="header">
        <h1 className="logo">
          <span className="bad">bad</span> bridge
        </h1>
      </header>
      <main className="card">
        <h2>{unwired ? "This build isn't wired to the chains yet" : 'Something broke'}</h2>
        <p className="lede">
          {unwired ? (
            <>
              The {deployment.id} adapters land in Phase 1. Meanwhile, <a href="?demo">try the demo</a>.
            </>
          ) : (
            'Reload the page to try again. Your kids are safe: nothing here can move them without your wallet.'
          )}
        </p>
        <p className="hint mono">{error.message}</p>
      </main>
    </div>
  )
}
