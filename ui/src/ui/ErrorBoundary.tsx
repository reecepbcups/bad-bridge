import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Catches render errors below it (including the real adapters' "not implemented" stubs) and shows `fallback`. */
export class ErrorBoundary extends Component<{ fallback: (error: Error) => ReactNode; children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn('bad bridge crashed', error, info.componentStack)
  }

  override render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children
  }
}
