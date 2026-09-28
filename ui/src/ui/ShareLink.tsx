import { useId, useState } from 'react'
import { useCopy } from './hooks'

/** The page's URL with `hash`, keeping the query string (so ?demo links stay demo links). */
export function shareUrl(hash: string): string {
  return `${location.origin}${location.pathname}${location.search}${hash}`
}

/** "Copy link" for a tracker page. If the clipboard is blocked, shows the link to copy by hand. */
export function ShareLink({ hash, label = 'Copy share link' }: { hash: string; label?: string }) {
  const { copy, copied } = useCopy()
  const [manual, setManual] = useState(false)
  const inputId = useId()
  const url = shareUrl(hash)
  return (
    <div className="share">
      <button
        type="button"
        className="btn ghost small"
        onClick={() => void copy(url).then((ok) => setManual(!ok))}
      >
        {copied ? 'Copied!' : label}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </span>
      {manual && (
        <>
          <label className="sr-only" htmlFor={inputId}>
            Link to share
          </label>
          <input id={inputId} type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} autoFocus />
        </>
      )}
    </div>
  )
}
