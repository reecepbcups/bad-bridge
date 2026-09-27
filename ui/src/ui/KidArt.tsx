import { useState } from 'react'
import type { KidId } from '../chain/types'
import { kidImage } from '../kids/image'

/** A kid's picture. Walks kidImage()'s candidates on error; with none left it's the blank art box. */
export function KidArt({ id, size = 96, className = 'art' }: { id: KidId; size?: number; className?: string }) {
  const [failed, setFailed] = useState<readonly string[]>([])
  const src = kidImage(id).find((s) => !failed.includes(s))
  if (!src) return <span className={className} role="img" aria-label={`Bad Kid #${id}`} />
  return (
    <img
      className={className}
      src={src}
      alt={`Bad Kid #${id}`}
      width={size}
      height={size}
      decoding="async"
      onError={() => setFailed((f) => [...f, src])}
    />
  )
}
