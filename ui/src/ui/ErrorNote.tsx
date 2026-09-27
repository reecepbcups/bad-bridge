import { isBridgeError, type KidId } from '../chain/types'
import { errorCopy, type ErrorAction } from './errors'

/** An error in kid-friendly words, with the raw detail tucked into a disclosure. */
export function ErrorNote({
  error,
  action,
  walletName,
  tokenId,
  onRetry,
  retryLabel = 'Try again',
  live = true,
}: {
  error: unknown
  action: ErrorAction
  walletName?: string
  tokenId?: KidId
  onRetry?: () => void
  retryLabel?: string
  /** Announce it (role=alert). Off for errors that are part of a page's initial render. */
  live?: boolean
}) {
  const copy = errorCopy(error, { action, walletName, tokenId })
  const detail = isBridgeError(error) ? error.detail : error instanceof Error ? error.message : undefined
  // saying no in the wallet isn't a failure: a calm note, not a red box
  const soft = isBridgeError(error) && error.code === 'UserRejected'
  return (
    <div className={soft ? 'oops soft' : 'oops'} role={live ? 'alert' : undefined}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M20 4 L37 35 L3 35 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
        <path d="M20 15 L20 24 M20 29 L20 30" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
      <div>
        <b>{copy.title}</b>
        <span>{copy.body}</span>
        {detail && (
          <details>
            <summary>Details</summary>
            <span className="mono">{detail}</span>
          </details>
        )}
        {onRetry && (
          <button type="button" className="linkish" onClick={onRetry}>
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  )
}
