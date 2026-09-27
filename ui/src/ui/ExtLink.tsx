import type { AnchorHTMLAttributes, ReactNode } from 'react'

const NEW_TAB = '(opens in a new tab)'

/** A link that opens in a new tab: no opener, no referrer, and it says so to screen readers. */
export function ExtLink({
  href,
  children,
  arrow = true,
  'aria-label': label,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel'> & { href: string; children: ReactNode; arrow?: boolean }) {
  return (
    <a {...rest} href={href} target="_blank" rel="noopener noreferrer" aria-label={label ? `${label} ${NEW_TAB}` : undefined}>
      {children}{' '}
      {/* the space sits outside the spans: whitespace at the edge of an sr-only box drops out of the name */}
      <span className="sr-only">{NEW_TAB}</span>
      {arrow && <span aria-hidden="true">↗</span>}
    </a>
  )
}
