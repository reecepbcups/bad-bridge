import { useBridge } from '../../chain/context'
import type { KidId } from '../../chain/types'
import { useTrip } from '../../trips/hooks'
import { Card } from '../chrome/Card'
import { KidArt } from '../KidArt'
import { STAGE_LINE, STAGE_PILL } from '../stages'
import './tracker.css'

// Phase 0 placeholder: one kid's trip, straight from useTrip().

export function KidView({ id }: { id: KidId }) {
  const { deployment } = useBridge()
  const trip = useTrip(id)
  const t = trip.data
  return (
    <Card>
      <div className="top" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <KidArt id={id} size={72} />
        <h2>#{id}</h2>
        {t && <span className={STAGE_PILL[t.stage].className}>{STAGE_PILL[t.stage].label}</span>}
      </div>
      {trip.error && <p className="hint bad">Couldn't load this kid ({trip.error.code}).</p>}
      {!t && !trip.error && <p className="muted">Looking…</p>}
      {t && (
        <>
          <p className="lede">{STAGE_LINE[t.stage]}{t.stuck ? '. The batcher looks stuck.' : '.'}</p>
          <ul className="muted">
            {t.recipient && <li>Headed to <span className="mono">{t.recipient}</span></li>}
            {t.sendTx && (
              <li>
                Sent in{' '}
                <a className="mono" href={deployment.explorer.hubTx(t.sendTx)} target="_blank" rel="noopener">
                  {t.sendTx.slice(0, 6)}…{t.sendTx.slice(-4)} ↗
                </a>
                {t.sendHeight !== undefined && <> at Hub block {t.sendHeight.toLocaleString('en-US')}</>}
              </li>
            )}
            {t.blocksToGo !== undefined && <li>{t.blocksToGo} Hub blocks until Ethereum catches up</li>}
            {t.owner && <li>Owned by <span className="mono">{t.owner}</span></li>}
          </ul>
        </>
      )}
    </Card>
  )
}
