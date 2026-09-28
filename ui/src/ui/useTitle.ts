import { useEffect } from 'react'

const APP = 'Bad Bridge'

/** Sets document.title to "<title> · Bad Bridge" while mounted, and puts the previous title back on unmount. */
export function useTitle(title: string): void {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · ${APP}`
    return () => {
      document.title = previous
    }
  }, [title])
}
