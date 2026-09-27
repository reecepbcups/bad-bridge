import type { ReactNode } from 'react'

/** The one big sketched card every view sits in. It's the page's <main>. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main id="main" className={className ? `card ${className}` : 'card'} aria-live="polite">
      {children}
    </main>
  )
}
