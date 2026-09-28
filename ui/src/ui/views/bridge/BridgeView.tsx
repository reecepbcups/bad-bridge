import { formatUnits } from 'viem'
import { PROVE_NEEDED } from '../../../chain/prove'
import { Card } from '../../chrome/Card'
import { ConnectButton } from '../../Connect'
import { GetProveButton } from '../../GetProve'
import { useFocusHeadingOnChange } from '../../hooks'
import { useProveReady } from '../../ProveKid'
import { useFlow } from './flow'
import { PickStep } from './PickStep'
import { ReviewStep } from './ReviewStep'
import './bridge.css'

/** pick → review. After a send you land on the Crossing tab. Locked until there's PROVE to pay for the proof. */
export function BridgeView() {
  const { flow } = useFlow()
  const ready = useProveReady()
  useFocusHeadingOnChange(flow.step)
  const locked = ready.status !== 'ok' && ready.status !== 'skip'
  return (
    <Card className={`step-${flow.step}`}>
      {locked && (
        <div className="warn prove-gate">
          <div>
            <b>Get PROVE first.</b>
            Crossing needs at least {formatUnits(PROVE_NEEDED, 18)} PROVE in your Succinct account. One proof costs about 0.33,
            the same for 1 kid or 10, so this covers a few tries.
            <span className="prove-gate-act">
              {ready.status === 'connect' && (
                <ConnectButton chain="eth" className="btn eth small">
                  Connect Ethereum
                </ConnectButton>
              )}
              {ready.status === 'short' && <GetProveButton className="btn eth small" onChange={ready.refetch} />}
              {ready.status === 'loading' && 'Checking your balance…'}
            </span>
            {/* COPY: PROVE gate */}
          </div>
        </div>
      )}
      <div className={locked ? 'prove-locked' : undefined} inert={locked || undefined}>
        {flow.step === 'pick' && <PickStep />}
        {flow.step === 'review' && <ReviewStep />}
      </div>
    </Card>
  )
}
