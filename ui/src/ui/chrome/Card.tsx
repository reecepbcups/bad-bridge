import type { ReactNode } from 'react'

/**
 * The one big sketched card every view sits in. It's the page's <main>. Not a live region: views announce
 * the specific things that change (counts, errors, tx results) instead of re-reading the whole card.
 */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main id="main" className={className ? `card ${className}` : 'card'}>
      {children}
    </main>
  )
}
