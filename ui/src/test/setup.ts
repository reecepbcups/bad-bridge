// Vitest setup for unit tests under src/: jest-dom matchers, a clean DOM between tests, and the
// browser APIs jsdom lacks that the app touches.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

window.scrollTo = () => undefined
if (!('matchMedia' in window)) {
  Object.defineProperty(window, 'matchMedia', { value: matchMediaStub, writable: true })
}

function matchMediaStub(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  } as MediaQueryList
}
