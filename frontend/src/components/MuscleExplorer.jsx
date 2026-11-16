import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { BODYPARTS, allExercises, equipmentOf, matchExercise } from '../lib/exercises.js'
import { activeProfile, exAvailable } from '../lib/equipment.js'
import { bestWeightFor } from '../lib/history.js'
import { fmtNum } from '../lib/format.js'
import { MUSCLES, MUSCLE_NAME, musclesOf } from '../lib/muscles.js'
import { MUSCLE_GROUPS, groupTerm, groupOfTerm, matchesTerms, toggleTerm, shownMuscles, termsWeight } from '../lib/muscle-filter.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import BodyMap from './BodyMap.jsx'
import { Thumb } from './Media.jsx'
import Icon from './Icon.jsx'
import { Button, Segmented } from './ui.jsx'

// Exercises → By muscle: tap a muscle on the body (or a chip under it) and get every exercise
// that trains it. Ported from upstream openGym's MuscleExplorer.
//
// The filter (lib/muscle-filter.js) is muscles and groups, AND by default. A group chip picks
// the whole group and opens its muscles in the strip below, to pick one of them instead.
export default function MuscleExplorer({ onDetail, onPlan, initial = null }) {
  const S = useStore(s => s.S)
  const [terms, setTerms] = useState(() => (initial ? [initial] : []))
  const [match, setMatch] = useState('all')
  const [openGroup, setOpenGroup] = useState(null)
  const [q, setQ] = useState('')
  const [bp, setBp] = useState('')
  const [eq, setEq] = useState('')
  const [shown, setShown] = useState(40)
  const [showAll, setShowAll] = useState(false)   // ignore the active equipment profile for this session
  // Same rule as the Library and the picker: the active equipment profile narrows the catalogue
  // (and the per-muscle counts) unless you ask for everything.
  const profile = activeProfile(S)
  const catalog = useMemo(() => {
    const all = allExercises(S)
    return (profile && !showAll) ? all.filter(e => exAvailable(S, e)) : all
  }, [S.customEx, S.equipFilterOn, S.activeEquipId, S.equipProfiles, showAll]) // eslint-disable-line react-hooks/exhaustive-deps
  // What each exercise works, once per catalogue: the counts and every later filter read it,
  // and asking musclesOf again for each of the 5,632 exercises on every tap is a visible stall.
  const worked = useMemo(() => new Map(catalog.map(e => [e.id, musclesOf(e)])), [catalog])
  const counts = useMemo(() => {
    const n = Object.fromEntries(MUSCLES.map(m => [m, 0]))
    for (const hit of worked.values()) for (const m in hit) if (hit[m] && m in n) n[m]++
    return n
  }, [worked])
  const reset = () => { setEq(''); setShown(40) }
  const pick = muscle => { setTerms(cur => toggleTerm(cur, muscle)); reset() }
  const pickGroup = g => {
    // A group of one muscle is just that muscle.
    if (g.muscles.length === 1) { pick(g.muscles[0]); return }
    const term = groupTerm(g.id)
    const on = terms.includes(term)
    setTerms(cur => toggleTerm(cur, term))
    setOpenGroup(on && openGroup === g.id ? null : g.id)
    reset()
  }
  const clearAll = () => { setTerms([]); setOpenGroup(null); reset() }
  const selected = terms.length > 0
  const lit = shownMuscles(terms)
  const termName = term => { const g = groupOfTerm(term); return g ? t(g.name) : t(MUSCLE_NAME[term]) }
  const targeted = useMemo(() => {
    if (!terms.length) return []
    const hits = catalog.filter(e => matchesTerms(worked.get(e.id), terms, match))
    // One muscle keeps the catalogue's order; a group or several rank by the most-worked of them.
    if (terms.length === 1 && !groupOfTerm(terms[0])) return hits
    return hits.map((e, i) => [e, termsWeight(worked.get(e.id), terms), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(x => x[0])
  }, [catalog, worked, terms, match])
  const base = targeted.filter(e => (!bp || e.bp === bp) && matchExercise(e, q))
  const eqOpts = equipmentOf(base)
  // Drop the equipment filter if the search narrowed it away, so you never hit a dead end.
  const eqOn = eqOpts.includes(eq) ? eq : ''
  const exercises = eqOn ? base.filter(e => e.eq === eqOn) : base

  return <>
    {profile && <div className="small dim row" style={{ margin: '-4px 2px 10px', gap: 6, alignItems: 'center' }}>
      <Icon name="dumbbell" style={{ fontSize: 13 }} />
      {showAll ? t('Showing all equipment') : t('Showing what you have in "{0}"', profile.name)}
      <button className="chip nocap" style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 12 }} onClick={() => { setShowAll(v => !v); setEq(''); setShown(40) }}>
        {showAll ? t('Filter by "{0}"', profile.name) : t('Show all equipment')}
      </button>
    </div>}
    <div className="card">
      <BodyMap className="tappable" body={S.body} selected={lit} onMuscle={pick} />
      <div className="chips mx-groups" style={{ marginTop: 10 }} role="group" aria-label={t('Muscle groups')}>
        {MUSCLE_GROUPS.map(g => {
          const single = g.muscles.length === 1
          const on = single ? terms.includes(g.muscles[0]) : terms.includes(groupTerm(g.id))
          return <button key={g.id} className={'chip' + (on ? ' on' : '')} aria-pressed={on}
            aria-expanded={single ? undefined : openGroup === g.id} onClick={() => pickGroup(g)}>
            {t(g.name)}{!single && <Icon name={openGroup === g.id ? 'chevronUp' : 'chevronDown'} className="mx-chev" />}
          </button>
        })}
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        {(MUSCLE_GROUPS.find(g => g.id === openGroup)?.muscles || MUSCLES).map(m => <button key={m} className={'chip' + (terms.includes(m) ? ' on' : '')}
          aria-pressed={terms.includes(m)} onClick={() => pick(m)}>
          {t(MUSCLE_NAME[m])} <span className="dim">{counts[m]}</span>
        </button>)}
      </div>
      {terms.length > 1 && <div style={{ marginTop: 10 }}>
        <Segmented value={match} onChange={v => { setMatch(v); setShown(40) }}
          options={[{ value: 'all', label: t('All of them') }, { value: 'any', label: t('Any of them') }]} />
      </div>}
    </div>

    {!selected && <div className="empty"><div className="ico"><Icon name="figureStrength" /></div>{t('Choose a muscle to see exercises that train it.')}</div>}

    {selected && <>
      <div className="row between" style={{ margin: '2px 0 10px', gap: 8 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Exercises for {0}', terms.map(termName).join(match === 'all' ? ' + ' : ' / '))} · {fmtNum(exercises.length)}</h4>
        <Button size="sm" variant="ghost" style={{ flex: 'none' }} onClick={clearAll}>{t('Clear selection')}</Button>
      </div>
      <div className="search" style={{ marginBottom: 10 }}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input className="input" placeholder={t('Search…')} value={q} onChange={e => { setQ(e.target.value); setShown(40) }} /></div>
      {/* Changing body part keeps the equipment filter (same rule as the Library): the eqOn
          fallback above drops it only for this view if the new body part has nothing under it,
          without forgetting the choice. "All" clears it, since it spans every body part. */}
      <div className="chips" style={{ marginBottom: eqOpts.length > 1 ? 8 : 12 }}>
        <button className={'chip nocap' + (!bp ? ' on' : '')} onClick={() => { setBp(''); setEq(''); setShown(40) }}>{t('All')}</button>
        {BODYPARTS.map(b => <button key={b} className={'chip' + (bp === b ? ' on' : '')} onClick={() => { setBp(b); setShown(40) }}>{t(b)}</button>)}
      </div>
      {eqOpts.length > 1 && <div className="chips" style={{ marginBottom: 12 }}>
        <button className={'chip nocap' + (!eqOn ? ' on' : '')} onClick={() => { setEq(''); setShown(40) }}>{t('Any equipment')}</button>
        {eqOpts.map(x => <button key={x} className={'chip' + (eqOn === x ? ' on' : '')} onClick={() => { setEq(x); setShown(40) }}>{t(x)}</button>)}
      </div>}
      <div className="list">
        {exercises.slice(0, shown).map(e => {
          const best = bestWeightFor(S, e.id)
          const w = worked.get(e.id) || {}
          const primary = lit.some(m => w[m] === 1)
          return <div key={e.id} className="item" onClick={() => onDetail(e)}>
            <Thumb ex={e} />
            <div className="grow"><div className="tt capitalize">{exerciseNameFor(e)}</div>
              <div className="ss">{t(primary ? 'Primary target' : 'Also trains')} · <span className="capitalize">{t(e.eq)}</span></div></div>
            {best > 0 && <span className="tag acc">{fmtNum(best)}</span>}
            <Button size="sm" variant="tinted" icon="plus" onClick={ev => { ev.stopPropagation(); onPlan(e) }}>{t('Plan')}</Button>
          </div>
        })}
        {exercises.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
      </div>
      {exercises.length > shown && <><div style={{ height: 10 }} /><Button onClick={() => setShown(s => s + 40)}>{t('Show more')}</Button></>}
    </>}
  </>
}
