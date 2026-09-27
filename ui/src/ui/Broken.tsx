import type { Deployment } from '../config/deployments'
import './chrome/Header.css'

/** A lazy chunk that didn't download: a flaky connection, or a new deploy replaced the files this page expects. */
export function isLoadError(error: Error): boolean {
  return /dynamically imported module|importing a module script failed|error loading dynamically imported|ChunkLoadError/i.test(
    `${error.name} ${error.message}`,
  )
}

/**
 * Shown when the chain provider itself fails: its code didn't download, or a wallet library threw while starting.
 * There's no wallet state to draw the normal chrome with, so this is a bare page with a way out.
 */
export function Broken({ error, deployment }: { error: Error; deployment: Deployment }) {
  const loading = isLoadError(error)
  return (
    <div className="wrap">
      <header className="header">
        <h1 className="logo">
          <span className="bad">bad</span> bridge
        </h1>
      </header>
      <main className="card" id="main">
        <h2>{loading ? "The bridge didn't finish loading" : 'Something broke while starting up'}</h2>
        <p className="lede">
          {loading
            ? "Part of the page didn't download. Check your connection and reload."
            : 'Reload to try again. If it keeps happening, let us know.'}{' '}
          Your kids are safe: nothing here can move them without your wallet.
          {/* COPY: startup failure */}
        </p>
        <div className="row start">
          <button type="button" className="btn" onClick={() => location.reload()}>
            Reload
          </button>
          {!loading && (
            <a className="btn ghost" href={`${deployment.sourceUrl}/issues`} target="_blank" rel="noopener">
              Report it ↗
            </a>
          )}
        </div>
        <details className="hint">
          <summary>Details</summary>
          <span className="mono">{error.message}</span>
        </details>
      </main>
    </div>
  )
}
