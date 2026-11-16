import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { DAYN, uid, exCount, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dayAssignSheet, loadStarterPlan, planToolsSheet, planSetupSheet, jumpBlockSheet, deloadNowSheet, confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'
import { planStatus, blockName, shiftWeeks, exNow, cancelDeload, skipEasyWeek } from '../lib/block-plan.js'
import { cleanCardio, cardioIcon } from '../lib/cardio.js'

export default function Plan() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)

  const addRoutine = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id)
  }

  const pst = planStatus(S, todayISO())
  const { plan, block } = pst
  const multi = plan.blocks.length > 1
  let before = 0

  return <>
    <div className="hdr">
      <div><h1>{t('Plan')}</h1><div className="sub">{t('Your weekly routine')}</div></div>
      <button className="iconbtn" onClick={planToolsSheet} aria-label={t('Share your plan')} title={t('Share your plan')}><Icon name="upload" /></button>
    </div>

    {/* Where you are in the programme, and the two ways to move: a week at a time, or straight
        to a block. The position is the only thing there is to set — the block, the lighter
        weeks and what every routine prescribes all follow from it. */}
    {S.routines.length > 0 && <div className="card" style={{ borderColor: 'var(--acc)' }}>
      <div className="row between">
        <div style={{ minWidth: 0 }}>
          <div className="big" style={{ fontSize: 20 }}>{plan.name || t('Training plan')}</div>
          <div className="muted small">
            {t('Week {0} of {1}', pst.week, pst.total)}
            {multi ? ' · ' + t('{0}, week {1} of {2}', blockName(block, pst.blockIndex), pst.weekInBlock, block.weeks) : ''}
            {pst.easy ? ' · ' + (pst.easyName || t('Lighter week')) : ''}
          </div>
        </div>
        <button className="iconbtn" onClick={planSetupSheet} aria-label={t('Plan setup')} title={t('Plan setup')}><Icon name="gear" /></button>
      </div>
      <div className="planbar">
        {plan.blocks.map((b, i) => {
          const start = before; before += b.weeks
          const done = pst.over ? b.weeks : Math.max(0, Math.min(b.weeks, pst.week - start))
          return <div key={b.id} style={{ flex: b.weeks }}><i style={{ width: (done / b.weeks * 100) + '%' }} /></div>
        })}
      </div>
      {multi && <div className="planlbl">
        {plan.blocks.map((b, i) => <span key={b.id} className={b.id === block.id ? 'on' : ''} style={{ flex: b.weeks }}>{blockName(b, i)}</span>)}
      </div>}
      <div className="row between" style={{ marginTop: 12 }}>
        <div className="row" style={{ gap: 6 }}>
          <button className="iconbtn" disabled={pst.elapsed === 0} style={pst.elapsed === 0 ? { opacity: .35 } : undefined}
            aria-label={t('Back one week')} onClick={() => update(s => { shiftWeeks(s, -1) })}><Icon name="minus" /></button>
          <span className="small muted" style={{ minWidth: 58, textAlign: 'center' }}>{t('Week {0}', pst.week)}</span>
          <button className="iconbtn" aria-label={t('Forward one week')} onClick={() => update(s => { shiftWeeks(s, 1) })}><Icon name="plus" /></button>
        </div>
        {multi && <Button size="sm" variant="tinted" icon="bolt" onClick={jumpBlockSheet}>{t('Jump to block')}</Button>}
      </div>
      {/* One action about this week's lighter status, whichever applies: take a deload now,
          call yours off, or skip the one the block scheduled. */}
      <div className="row between" style={{ marginTop: 10 }}>
        <span className="small muted" style={{ minWidth: 0 }}>
          {pst.extra ? t('{0} — your plan is paused this week', pst.easyName || t('Deload'))
            : pst.easy ? t('{0} is scheduled this week', pst.easyName || t('Lighter week'))
            : t('Need a lighter week?')}
        </span>
        {pst.extra
          ? <Button size="sm" variant="ghost" onClick={() => update(s => { cancelDeload(s) })}>{t('Cancel deload')}</Button>
          : pst.easy
            ? <Button size="sm" variant="ghost" onClick={() => confirmSheet({
                title: t('Skip {0}?', pst.easyName || t('Lighter week')),
                message: t('This week becomes the next week of the block, trained normally. The back-one-week button undoes it.'),
                confirmText: t('Skip'),
                onConfirm: () => update(s => { skipEasyWeek(s) }),
              })}>{t('Skip {0}', pst.easyName || t('Lighter week'))}</Button>
            : <Button size="sm" variant="ghost" onClick={deloadNowSheet}>{t('Deload this week')}</Button>}
      </div>
    </div>}
    <div className="cols"><div>
      <h4 className="sec">{t('Week schedule')}</h4>
      <div className="list" style={{ display: 'flex', flexDirection: 'column' }}>
        {[1, 2, 3, 4, 5, 6, 0].map(d => {
          const r = S.routines.find(x => x.id === S.week[d])
          const cardio = cleanCardio((S.cardio || {})[d])
          return <div key={d} className="item" onClick={() => dayAssignSheet(d)}>
            <div className="grow"><div className="tt">{t(DAYN[d])}</div></div>
            {cardio && <span className="tag nocap" style={{ color: 'var(--teal)' }} title={cardio.mod}><Icon name={cardioIcon(cardio.mod)} />{cardio.min} min</span>}
            {r ? <span className="tag acc"><Icon name={glyphOf(r.emoji)} />{r.name}</span> : <span className="tag">{t('Rest')}</span>}
            <Icon name="chevronRight" className="chev" /></div>
        })}
      </div>
    </div><div>
      <div className="row between" style={{ marginTop: 22, marginBottom: 10 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Routines')}</h4>
        <Button size="sm" variant="tinted" icon="plus" onClick={addRoutine}>{t('New')}</Button>
      </div>
      {S.routines.length ? <div className="list">{S.routines.map(r => <div key={r.id} className="item" onClick={() => nav('/plan/r/' + r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(exNow(S, r).length)}</div></div>
        <Icon name="chevronRight" className="chev" /></div>)}</div> : <>
        <div className="empty"><div className="ico"><Icon name="clipboard" /></div>{t('No routines yet.')}<br />{t('Create one or load the starter plan.')}</div>
        <Button icon="sparkles" onClick={loadStarterPlan}>{t('Load starter plan (Push / Pull / Legs)')}</Button>
      </>}
    </div></div>
  </>
}
