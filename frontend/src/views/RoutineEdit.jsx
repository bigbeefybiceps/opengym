import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { exOr } from '../lib/exercises.js'
import { activeProfile, exAvailable } from '../lib/equipment.js'
import { uid, todayISO } from '../lib/format.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { supersetUnits, cleanupSg, exLine } from '../lib/history.js'
import { Thumb } from '../components/Media.jsx'
import { glyphPicker, exercisePicker, exConfigSheet, confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { Button, SelectRow, Segmented } from '../components/ui.jsx'
import { POLICIES_FOR, POLICY_NAME, POLICY_DESC, strandedOverrides } from '../lib/progression.js'
import BodyMap from '../components/BodyMap.jsx'
import { loadOfRoutine, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { planStatus, blockName, exOf, ownList, listsOf, hasOwnList, copyBlockList, applyToAllBlocks, differsFromFirst, effortScale } from '../lib/block-plan.js'

export default function RoutineEdit() {
  const nav = useNavigate()
  const { id } = useParams()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const r = S.routines.find(x => x.id === id)
  useEffect(() => { if (!r) nav('/plan') }, [!!r])
  // Editing here has no explicit "save" — every field change persists immediately. A single
  // auto-backup on the way out (not per keystroke) covers the whole editing session, deletion
  // included: this still unmounts after the delete button navigates away.
  useEffect(() => () => useStore.getState().autoBackupNow(), [])
  // Which block's prescription is on screen. It opens on the block being trained, because
  // that is the one an edit is almost always meant for; the others are a tap away.
  const pst = planStatus(S, todayISO())
  const blocks = pst.plan.blocks
  const [viewId, setViewId] = useState(pst.block.id)
  if (!r) return null
  const view = blocks.find(b => b.id === viewId) || pst.block
  const viewIdx = blocks.indexOf(view)
  const list = exOf(r, view.id)
  const multi = blocks.length > 1
  // What the exercise sheet needs to know about where it is editing.
  const ctx = { blocks: blocks.length, blockName: blockName(view, viewIdx), lighter: view.easy ? { name: view.easy.name, pct: view.easy.pct } : null }

  // Every edit goes to the block on screen and nowhere else. ownList gives that block its
  // own copy the first time it is edited, if it was still reading another block's list.
  const edit = fn => update(s => { const rt = s.routines.find(x => x.id === id); fn(ownList(s, rt, view.id), s, rt) })
  // The same exercise in the routine's other blocks, for the edits that are meant to travel.
  const others = (s, rt) => blocks.filter(b => b.id !== view.id).map(b => ownList(s, rt, b.id))
  const saveAt = (i, cfg, opts) => edit((x, s, rt) => {
    const before = x[i]
    const after = { id: before.id, sg: before.sg, ...cfg }
    x[i] = after
    if (opts?.all) applyToAllBlocks(s, rt, view.id, before, after)
  })
  const removeAt = (i, opts) => edit((x, s, rt) => {
    const gone = x[i]
    x.splice(i, 1); cleanupSg(x)
    if (opts?.all) others(s, rt).forEach(l => { const k = l.findIndex(e => e.id === gone.id); if (k >= 0) { l.splice(k, 1); cleanupSg(l) } })
  })
  const addNew = (exId, cfg, opts) => edit((x, s, rt) => {
    x.push({ id: exId, ...cfg })
    if (opts?.all) others(s, rt).forEach(l => { if (!l.some(e => e.id === exId)) l.push({ id: exId, ...JSON.parse(JSON.stringify(cfg)) }) })
  })
  const move = (i, dir) => edit(ex => { const j = i + dir; if (j < 0 || j >= ex.length) return;[ex[i], ex[j]] = [ex[j], ex[i]]; cleanupSg(ex) })
  const toggleLink = i => edit(ex => {
    if (i < 1) return
    const cur = ex[i], prev = ex[i - 1]
    if (cur.sg && prev.sg && cur.sg === prev.sg) delete cur.sg
    else { const gid = prev.sg || ('sg' + uid()); prev.sg = gid; cur.sg = gid }
    cleanupSg(ex)
  })

  // Changing the routine's rule is meant to change the routine. Exercises that set their own
  // beat it (policyFor), so a plan that stamped a rule on every exercise — an import usually —
  // leaves this picker doing visibly nothing. Say so, and offer the one-tap way out.
  const setProg = v => {
    update(s => { s.routines.find(x => x.id === id).prog = v })
    // Counted across every block: the rule belongs to the routine, and an override that
    // survives in Block 2 is the same trap one block later.
    const strandedIn = rt => listsOf(rt).flatMap(l => strandedOverrides({ ex: l }, v))
    const stranded = strandedIn(r)
    if (!stranded.length) return
    confirmSheet({
      title: t('Apply to every exercise?'),
      message: t('{0} exercises here set their own rule, so they will keep it and ignore this change. Clear those and let them follow “{1}”?', stranded.length, t(POLICY_NAME[v])),
      confirmText: t('Clear overrides'),
      cancelText: t('Leave them'),
      onConfirm: () => update(s => {
        const rt = s.routines.find(x => x.id === id)
        strandedIn(rt).forEach(e => { delete e.prog })
      }),
    })
  }

  const units = supersetUnits(list)
  const unitFirst = new Set(units.filter(u => u.length > 1).map(u => u[0]))
  const inSS = new Set(units.filter(u => u.length > 1).flat())
  const profile = activeProfile(S)
  const missingCount = profile ? list.filter(e => !exAvailable(S, exOr(e.id))).length : 0

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/plan')} aria-label={t('Plan')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, margin: '0 12px' }}>
        <input className="input" defaultValue={r.name} style={{ fontWeight: 600, fontSize: 20, letterSpacing: '-.021em' }}
          onChange={e => update(s => { s.routines.find(x => x.id === id).name = e.target.value.trim() || t('Routine') })} />
      </div>
      <button className="iconbtn" aria-label={t('Pick an icon')} onClick={() => glyphPicker(r.emoji, g => update(s => { s.routines.find(x => x.id === id).emoji = g }))}><Icon name={glyphOf(r.emoji)} /></button>
    </div>

    {multi && <>
      <div style={{ marginBottom: 10 }}>
        <Segmented className="seg-range" value={view.id} onChange={setViewId}
          options={blocks.map((b, i) => ({ value: b.id, label: blockName(b, i) + (b.id === pst.block.id ? ' · ' + t('now') : '') }))} />
      </div>
      {/* The mistake this guards against costs a whole block: editing the one you are not
          training and finding out six weeks later. */}
      {view.id !== pst.block.id && <div className="card" style={{ marginBottom: 12, borderColor: 'var(--yellow)', padding: '10px 14px' }}>
        <div className="small" style={{ color: 'var(--yellow)' }}>
          {t('Editing {0}. You are training {1}.', blockName(view, viewIdx), blockName(pst.block, pst.blockIndex))}
        </div>
      </div>}
      {!hasOwnList(S, r, view.id) && <div className="small dim" style={{ margin: '-2px 2px 12px' }}>
        {t('Same as {0} until you change something here.', blockName(blocks.find(b => hasOwnList(S, r, b.id)) || blocks[0], blocks.indexOf(blocks.find(b => hasOwnList(S, r, b.id)) || blocks[0])))}
      </div>}
    </>}

    <div className="sect-b" style={{ marginBottom: 16 }}>
      <SelectRow icon="chartLine" title={t('Progression')} sheetTitle={t('Progression')}
        value={r.prog || 'linear'} onChange={setProg}
        options={POLICIES_FOR.reps.map(p => ({ value: p, label: t(POLICY_NAME[p]), subtitle: t(POLICY_DESC[p]) }))} />
    </div>
    <div className="small dim" style={{ margin: '-10px 2px 16px' }}>
      {t('Applies to every exercise in this routine that does not set its own rule.')}
    </div>

    {missingCount > 0 && <div className="card" style={{ marginBottom: 16, borderColor: 'var(--orange)' }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <Icon name="warning" style={{ color: 'var(--orange)' }} />
        <div className="small">{t('{0} of {1} exercises need equipment outside "{2}"', missingCount, list.length, profile.name)}</div>
      </div>
    </div>}

    {list.length ? <div className="list">{list.map((e, i) => {
      // An unresolvable id is shown rather than skipped — hiding it left an entry you
      // could neither see nor delete, but that still turned up in the workout.
      const ex = exOr(e.id)
      const noEquip = profile && !exAvailable(S, ex)
      const linkedPrev = i > 0 && e.sg && list[i - 1].sg === e.sg
      return <div key={i}>
        {unitFirst.has(i) && <div className="ss-label"><Icon name="link" />{t('Superset')}</div>}
        <div className={'item' + (inSS.has(i) ? ' in-ss' : '')} onClick={() => {
          exConfigSheet(ex, e, (cfg, opts) => saveAt(i, cfg, opts), opts => removeAt(i, opts), r, null, ctx)
        }}>
          <Thumb ex={ex} />
          <div className="grow"><div className="tt capitalize">{exerciseNameFor(ex)}</div><div className="ss">{exLine(e, S.unit)}</div>
            {/* What this block asks of the exercise beyond sets and reps: the effort, and the
                technique for the last set. These are what differ between blocks, so they are
                what the list has to show for the blocks to be told apart at a glance. */}
            {(effortScale(e) || e.tech) && <div className="small" style={{ marginTop: 2, color: 'var(--acc)' }}>
              {[effortScale(e) ? (effortScale(e) === 'rpe' ? 'RPE ' : 'RIR ') + e[effortScale(e)].join(' · ') : null, e.tech ? t('Last set: {0}', e.tech) : null].filter(Boolean).join('  ·  ')}
            </div>}
            {multi && differsFromFirst(S, r, view.id, e) && <div className="small dim" style={{ marginTop: 2 }}>
              <Icon name="shuffle" style={{ fontSize: 11, marginRight: 4, verticalAlign: '-1px' }} />{t('Differs from {0}', blockName(blocks[0], 0))}
            </div>}
            {e.note && <div className="small dim" style={{ marginTop: 2 }}>{e.note}</div>}
            {e.prog && e.prog !== (r.prog || 'linear') && <div className="small dim" style={{ marginTop: 2 }}>
              <Icon name="chartLine" style={{ fontSize: 11, marginRight: 4, verticalAlign: '-1px' }} />{t('Own rule: {0}', t(POLICY_NAME[e.prog]))}
            </div>}</div>
          {noEquip && <span className="tag" style={{ color: 'var(--orange)', borderColor: 'var(--orange)' }} title={t('Needs {0} — not in your active profile', t(ex.eq))}><Icon name="warning" /></span>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 'none', alignItems: 'center' }}>
            {i > 0 && <button className={'iconbtn' + (linkedPrev ? ' on-ss' : '')} title={t('Superset with exercise above')} style={{ width: 32, height: 28, borderRadius: 8, fontSize: 15 }} onClick={ev => { ev.stopPropagation(); toggleLink(i) }}><Icon name="link" /></button>}
            <div style={{ display: 'flex', gap: 2 }}>
              <button className="iconbtn" aria-label="Move up" style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }} onClick={ev => { ev.stopPropagation(); move(i, -1) }}><Icon name="chevronUp" /></button>
              <button className="iconbtn" aria-label="Move down" style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }} onClick={ev => { ev.stopPropagation(); move(i, 1) }}><Icon name="chevronDown" /></button>
            </div>
          </div>
        </div>
      </div>
    })}</div> : <div className="empty"><div className="ico"><Icon name="dumbbell" /></div>{t('No exercises yet — add your first one.')}</div>}

    {/* Coverage of the routine as planned, so a gap shows up while you're building it
        rather than after a month of training around it. */}
    {list.length > 0 && (() => {
      const load = loadOfRoutine({ ...r, ex: list })
      const { worked } = rankOf(load)
      return <div className="card" style={{ marginTop: 12 }}>
        <h2>{t('What this session hits')}</h2>
        <BodyMap load={load} body={S.body} />
        <div className="mchips">
          {worked.slice(0, 6).map(m => <span key={m} className="mchip">{t(MUSCLE_NAME[m])}</span>)}
        </div>
      </div>
    })()}

    <div className="small dim row" style={{ margin: '10px 2px', gap: 5 }}><Icon name="link" style={{ fontSize: 13 }} />{t('Tap the link button on an exercise to superset it with the one above — you’ll do them back-to-back.')}</div>
    <Button variant="primary" onClick={() => exercisePicker(ex => exConfigSheet(ex, null, (cfg, opts) => addNew(ex.id, cfg, opts), null, r, null, ctx))} icon="plus">{t('Add exercise')}</Button>
    {/* Start a block over from another one — the quick way to make Block 2 "Block 1, plus
        these changes" again after the two have drifted. */}
    {multi && <><div style={{ height: 10 }} />
      <div className="sect-b">
        <SelectRow icon="clipboard" iconTint="var(--blue)" title={t('Copy another block here')} sheetTitle={t('Replace {0} with a copy of…', blockName(view, viewIdx))}
          value="" onChange={from => from && confirmSheet({
            title: t('Replace {0}?', blockName(view, viewIdx)),
            message: t('This routine’s exercises in {0} are replaced with a copy of {1}.', blockName(view, viewIdx), blockName(blocks.find(b => b.id === from), blocks.findIndex(b => b.id === from))),
            confirmText: t('Replace'), danger: true,
            onConfirm: () => update(s => copyBlockList(s, s.routines.find(x => x.id === id), from, view.id)),
          })}
          options={blocks.filter(b => b.id !== view.id).map(b => ({ value: b.id, label: blockName(b, blocks.indexOf(b)) }))} />
      </div></>}
    <div style={{ height: 10 }} />
    <Button variant="danger" onClick={() => confirmSheet({
      title: t('Delete routine?'), message: t('“{0}” and its exercises will be removed.', r.name), confirmText: t('Delete'), danger: true,
      onConfirm: () => {
        update(s => {
          s.routines = s.routines.filter(x => x.id !== id)
          Object.keys(s.week).forEach(k => { if (s.week[k] === id) delete s.week[k] })
          Object.keys(s.dayPlan).forEach(k => { if (s.dayPlan[k] === id) delete s.dayPlan[k] })
        })
        nav('/plan')
      }
    })}>{t('Delete routine')}</Button>
  </div>
}
