import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useTitle } from './useTitle'

afterEach(() => {
  document.title = 'Bad Bridge'
})

describe('useTitle', () => {
  it('sets "<title> · Bad Bridge" and restores the old title on unmount', () => {
    document.title = 'Bad Bridge'
    const { rerender, unmount } = renderHook(({ title }) => useTitle(title), { initialProps: { title: 'Ready to claim' } })
    expect(document.title).toBe('Ready to claim · Bad Bridge')
    rerender({ title: '#2' })
    expect(document.title).toBe('#2 · Bad Bridge')
    unmount()
    expect(document.title).toBe('Bad Bridge')
  })
})
