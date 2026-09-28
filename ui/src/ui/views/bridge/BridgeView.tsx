import { Card } from '../../chrome/Card'
import { useFocusHeadingOnChange } from '../../hooks'
import { useFlow } from './flow'
import { PickStep } from './PickStep'
import { ReviewStep } from './ReviewStep'
import './bridge.css'

/** pick → review. After a send you land on the Crossing tab. */
export function BridgeView() {
  const { flow } = useFlow()
  useFocusHeadingOnChange(flow.step)
  return (
    <Card className={`step-${flow.step}`}>
      {flow.step === 'pick' && <PickStep />}
      {flow.step === 'review' && <ReviewStep />}
    </Card>
  )
}
