import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Catches render errors below it and shows `fallback`. `reset` clears the error and tries again; changing
 * `resetKey` (the route, say) does the same, so navigating away from a broken view recovers.
 */
export class ErrorBoundary extends Component<
  { fallback: (error: Error, reset: () => void) => ReactNode; resetKey?: string; children: ReactNode },
  { error: Error | null; key: string | undefined }
> {
  override state: { error: Error | null; key: string | undefined } = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  static getDerivedStateFromProps(props: { resetKey?: string }, state: { error: Error | null; key: string | undefined }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn('bad bridge crashed', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  override render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children
  }
}
