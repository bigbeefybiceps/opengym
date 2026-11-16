import { useNavigate, useSearchParams } from 'react-router-dom'
import { MUSCLES } from '../lib/muscles.js'
import { t } from '../lib/i18n.js'
import MuscleExplorer from '../components/MuscleExplorer.jsx'
import { exerciseDetailSheet, addToRoutineSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'

// Exercises → By muscle. `?m=<muscle>` opens on that muscle. Ported from upstream openGym.
export default function Muscles() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const m = params.get('m')
  const initial = m && MUSCLES.includes(m) ? m : null
  return <>
    <div className="hdr" style={{ alignItems: 'flex-start', justifyContent: 'flex-start' }}>
      <button className="iconbtn" style={{ flex: 'none' }} onClick={() => nav('/library')} aria-label={t('Exercises')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, minWidth: 0 }}><h1>{t('Explore muscles')}</h1><div className="sub">{t('Choose a muscle to see exercises that train it.')}</div></div>
    </div>
    <MuscleExplorer key={initial || ''} initial={initial} onDetail={exerciseDetailSheet} onPlan={addToRoutineSheet} />
  </>
}
