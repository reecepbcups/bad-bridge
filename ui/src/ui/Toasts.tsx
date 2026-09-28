import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ExtLink } from './ExtLink'
import './Toasts.css'

// Short-lived notices for tx results that happen away from where you clicked (claims in the tracker,
// a send that moved the flow on). Inline errors stay inline; this is for "it worked" and links.

export interface Toast {
  /** ok: it worked. bad: it didn't. */
  tone: 'ok' | 'bad'
  title: string
  body?: string
  link?: { href: string; label: string }
}

interface ToastEntry extends Toast {
  id: number
}

const ToastContext = createContext<((toast: Toast) => void) | null>(null)

const TOAST_MS = 8_000
/** A toast with a link lasts longer: it's there to be clicked. */
const LINK_TOAST_MS = 20_000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastEntry[]>([])
  const counter = useRef(0)
  const show = useCallback((toast: Toast) => {
    const id = ++counter.current
    setToasts((list) => [...list.slice(-2), { ...toast, id }])
  }, [])
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Goes away on its own, but never while the pointer or focus is on it. */
function ToastCard({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const held = hover || focus
  useEffect(() => {
    if (held) return
    const t = setTimeout(() => onDismiss(toast.id), toast.link ? LINK_TOAST_MS : TOAST_MS)
    return () => clearTimeout(t)
  }, [toast.id, toast.link, onDismiss, held])
  return (
    <div
      className={`toast ${toast.tone}`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false)
      }}
    >
      <div>
        <b>{toast.title}</b>
        {toast.body && <span>{toast.body}</span>}
        {toast.link && <ExtLink href={toast.link.href}>{toast.link.label}</ExtLink>}
      </div>
      <button type="button" className="x" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
        ×
      </button>
    </div>
  )
}

/** Shows a toast. A no-op outside ToastProvider (component tests). */
export function useToast(): (toast: Toast) => void {
  return useContext(ToastContext) ?? noop
}

function noop() {}
