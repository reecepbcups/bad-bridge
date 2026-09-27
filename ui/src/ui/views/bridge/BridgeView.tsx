import { useTrips } from '../../../trips/hooks'
import { Card } from '../../chrome/Card'
import { Stepper } from '../../chrome/Stepper'
import { useFocusHeadingOnChange } from '../../hooks'
import { ClaimStep, DoneStep } from './ClaimStep'
import { CrossingStep } from './CrossingStep'
import { currentStep, STEP_OF, useFlow } from './flow'
import { PickStep } from './PickStep'
import { ReviewStep } from './ReviewStep'
import './bridge.css'

/** pick → review → crossing → claim → done, with the stepper above. */
export function BridgeView() {
  const { flow } = useFlow()
  // faster polling while the kids are on the bridge
  const trips = useTrips({ ids: flow.sent?.ids ?? [] }, { live: true })
  const step = currentStep(flow, trips.data)
  useFocusHeadingOnChange(step)
  const sent = flow.sent
  const list = trips.data ?? []
  return (
    <>
      <Stepper current={STEP_OF[step]} />
      <Card className={`step-${step}`}>
        {step === 'pick' && <PickStep />}
        {step === 'review' && <ReviewStep />}
        {sent && step === 'crossing' && <CrossingStep sent={sent} trips={list} error={trips.error} onRetry={trips.refetch} />}
        {sent && step === 'claim' && <ClaimStep sent={sent} trips={list} />}
        {sent && step === 'done' && <DoneStep sent={sent} claimTx={flow.claimTx} />}
      </Card>
    </>
  )
}
