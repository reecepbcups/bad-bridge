import type { ReactNode } from 'react'
import type { Deployment } from '../../config/deployments'

/** Wraps the tree in the Hub wallet library's provider (GrazProvider). Phase 0 stub: passes through. */
export function HubWalletProvider({ children }: { deployment: Deployment; children: ReactNode }) {
  return children
}
