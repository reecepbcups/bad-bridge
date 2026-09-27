import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { demoWrapper } from '../test/demo'
import { skipToMain } from './chrome/Shell'
import { useFocusWhenDone } from './hooks'
import { PickStep } from './views/bridge/PickStep'

// Focus must never fall to <body> when the control that had it goes away.

function ClaimRow({ other = false }: { other?: boolean }) {
  const [stage, setStage] = useState<'ready' | 'claiming' | 'home'>('ready')
  const link = useRef<HTMLAnchorElement>(null)
  useFocusWhenDone(stage === 'claiming', stage === 'home', link)
  return (
    <>
      <a href="#/kid/1" ref={link}>
        #1
      </a>
      {other && <button type="button">elsewhere</button>}
      {stage !== 'home' && (
        <button type="button" onClick={() => setStage('claiming')}>
          Claim
        </button>
      )}
      <button type="button" onClick={() => setStage('home')} aria-label="land it" />
    </>
  )
}

describe('focus', () => {
  it('moves to the kid once its Claim button goes away', async () => {
    render(<ClaimRow />)
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    // the claim lands while focus is on the button, which then unmounts
    act(() => screen.getByRole('button', { name: 'land it' }).click())
    expect(screen.queryByRole('button', { name: 'Claim' })).toBeNull()
    expect(screen.getByRole('link', { name: '#1' })).toHaveFocus()
  })

  it('leaves focus alone when it is somewhere else', async () => {
    render(<ClaimRow other />)
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    screen.getByRole('button', { name: 'elsewhere' }).focus()
    act(() => screen.getByRole('button', { name: 'land it' }).click())
    expect(screen.getByRole('button', { name: 'elsewhere' })).toHaveFocus()
  })

  it('the skip link focuses the view heading and leaves the hash alone', () => {
    location.hash = '#/kids'
    render(
      <>
        <a href="#main" onClick={skipToMain}>
          Skip to content
        </a>
        <main id="main">
          <h2>My kids</h2>
        </main>
      </>,
    )
    screen.getByRole('link', { name: 'Skip to content' }).click()
    expect(screen.getByRole('heading', { name: 'My kids' })).toHaveFocus()
    expect(location.hash).toBe('#/kids')
  })

  it('connecting from the pick screen lands on its heading', async () => {
    render(<PickStep />, { wrapper: demoWrapper({ disconnected: true }) })
    await act(() => userEvent.click(screen.getByRole('button', { name: 'Connect Keplr' })))
    expect(await screen.findByRole('group', { name: 'Your kids' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "Who's crossing?" })).toHaveFocus()
  })
})
