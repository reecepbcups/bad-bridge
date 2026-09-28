import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { EthAddress, KidId } from '../../../chain/types'
import type { Trip } from '../../../trips/types'
import type { Step as StepperStep } from '../../chrome/Stepper'

// The bridge flow's state. Lives above the routes, so hopping to My kids and back keeps your place.
// A reload starts fresh; the pick screen's "N kids crossing" nudge picks up from there.
// Only pick → review → sent is stored. After a send, crossing / claim / done come from chain state, so a
// batcher that claims for you just skips the claim screen.

export type FlowStep = 'pick' | 'review' | 'crossing' | 'claim' | 'done'

/** A send that landed: the kids travel together from here. */
export interface SentTrip {
  ids: readonly KidId[]
  recipient: EthAddress
  txHash: string
}

export interface Flow {
  /** Where the user is before sending. Ignored once `sent` is set. */
  step: 'pick' | 'review'
  /** Picked kids, in the order they were picked. */
  picked: readonly KidId[]
  /** What's typed in the recipient box. null until the user touches it: then it follows the connected wallet. */
  recipient: string | null
  /** Set once Send lands. */
  sent: SentTrip | null
  /** Set once this page claimed them. */
  claimTx: string | null
}

export const STEP_OF: Readonly<Record<FlowStep, StepperStep>> = { pick: 0, review: 0, crossing: 1, claim: 2, done: 3 }

const START: Flow = { step: 'pick', picked: [], recipient: null, sent: null, claimTx: null }

/** The screen to show. After a send it follows the kids: all proven → claim, all minted (or claimed here) → done. */
export function currentStep(flow: Flow, trips: readonly Trip[] | undefined): FlowStep {
  if (!flow.sent) return flow.step
  if (flow.claimTx) return 'done'
  const mine = (trips ?? []).filter((t) => flow.sent?.ids.includes(t.tokenId))
  if (mine.length < flow.sent.ids.length) return 'crossing'
  if (mine.every((t) => t.stage === 'home-eth')) return 'done'
  if (mine.every((t) => t.stage === 'ready' || t.stage === 'home-eth')) return 'claim'
  return 'crossing'
}

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
