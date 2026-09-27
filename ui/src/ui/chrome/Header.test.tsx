import { act, render, screen, within } from '@testing-library/react'
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

  it('connects a disconnected wallet through the connect sheet', async () => {
    render(<Header />, { wrapper: demoWrapper({ disconnected: true }) })
    await act(() => userEvent.click(screen.getByRole('button', { name: /connect Cosmos Hub/ })))
    const sheet = screen.getByRole('dialog', { name: 'Connect Cosmos Hub' })
    // installed wallets connect, missing ones link to their install page
    expect(within(sheet).getByRole('link', { name: /Get it.*Cosmostation/ })).toHaveAttribute('href', 'https://www.cosmostation.io/')
    await act(() => userEvent.click(within(sheet).getByRole('button', { name: 'Connect Keplr' })))
    expect(await screen.findByText('cosmos1q8m…3fxl')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect Ethereum/ })).toBeEnabled()
  })

  it('disconnects from the wallet sheet', async () => {
    render(<Header />, { wrapper: demoWrapper() })
    await act(() => userEvent.click(screen.getByRole('button', { name: /Ethereum wallet/ })))
    await act(() => userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disconnect' })))
    expect(await screen.findByRole('button', { name: /connect Ethereum/ })).toBeInTheDocument()
  })
})
