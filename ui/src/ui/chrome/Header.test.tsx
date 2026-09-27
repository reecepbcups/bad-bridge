import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { demoWrapper } from '../../test/demo'
import { Header } from './Header'

// The pattern for component tests: render over demoWrapper(), drive it with user-event.

describe('Header', () => {
  it('shows both connected wallets as short addresses', () => {
    render(<Header />, { wrapper: demoWrapper() })
    expect(screen.getByText('cosmos1q8m…3fxl')).toBeInTheDocument()
    expect(screen.getByText('0x8f3a…c21d')).toBeInTheDocument()
  })

  it('connects a disconnected wallet', async () => {
    render(<Header />, { wrapper: demoWrapper({ disconnected: true }) })
    await act(() => userEvent.click(screen.getByRole('button', { name: /connect Cosmos Hub/ })))
    expect(await screen.findByText('cosmos1q8m…3fxl')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect Ethereum/ })).toBeEnabled()
  })
})
