import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { KidId } from '../../../chain/types'

// The bridge flow's state. Lives above the routes, so hopping to another tab and back keeps your place.
// Only pick and review are stored. After a send you land on the Crossing tab, which reads chain state.

export interface Flow {
  /** Where the user is before sending. */
  step: 'pick' | 'review'
  /** Picked kids, in the order they were picked. */
  picked: readonly KidId[]
  /** What's typed in the recipient box. null until the user touches it: then it follows the connected wallet. */
  recipient: string | null
}

const START: Flow = { step: 'pick', picked: [], recipient: null }

interface FlowContextValue {
  flow: Flow
  update: (patch: Partial<Flow> | ((f: Flow) => Partial<Flow>)) => void
  /** Back to an empty pick screen. */
  restart: () => void
}

const FlowContext = createContext<FlowContextValue | null>(null)

function useFlowState(): FlowContextValue {
  const [flow, setFlow] = useState<Flow>(START)
  return useMemo<FlowContextValue>(
    () => ({
      flow,
      update: (patch) => setFlow((f) => ({ ...f, ...(typeof patch === 'function' ? patch(f) : patch) })),
      restart: () => setFlow(START),
    }),
    [flow],
  )
}

export function FlowProvider({ children }: { children: ReactNode }) {
  return <FlowContext.Provider value={useFlowState()}>{children}</FlowContext.Provider>
}

/** The flow state. Falls back to local state outside FlowProvider (component tests). */
export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext)
  const local = useFlowState()
  return ctx ?? local
}
