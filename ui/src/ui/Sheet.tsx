import { useEffect, useId, useRef, type ReactNode } from 'react'
import './Sheet.css'

/**
 * A crayon-style modal on the native <dialog>: focus is trapped, Escape closes, focus returns to the opener.
 * Children only render while open, so each opening starts fresh.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      // a click on the backdrop lands on the dialog itself
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {open && (
        <div className="sheet-body">
          <div className="sheet-head">
            <h2 id={titleId} className="sheet-title">
              {title}
            </h2>
            <button type="button" className="x" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
