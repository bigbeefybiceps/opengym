import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, exerciseNameFor, getLang } from '../lib/i18n.js'
import { exOr } from '../lib/exercises.js'
import { fmtDate, todayISO, isoOf, uid } from '../lib/format.js'
import {
  collectNotes, filterNotes, normFilter, filterIsEmpty, kindCounts, notedExercises, foldersOf, withFolder,
  NOTE_KINDS, NOTE_KIND_LABEL, NOTE_KIND_ICON, FOLDERS_MAX,
} from '../lib/journal.js'
import { cardioIcon } from '../lib/cardio.js'
import Icon from '../components/Icon.jsx'
import { Button, SearchField, TextField } from '../components/ui.jsx'
import { menuSheet, workoutDetailSheet, exerciseHistorySheet, cardioLogSheet } from '../sheets.jsx'

// The journal (Stats → Journal; lib/journal.js reads the notes): one feed of everything you ever
// wrote down, newest first, with the always-on notes and the routine tips after the dated ones.
// Narrow it by kind, by exercise, by dates or by words; keep a narrowing you use as a folder (a
// saved filter, so a note is never in one place only). Tap a note to read it whole, or to jump
// to its workout or its exercise. Ported from upstream openGym.

const ui = () => useUI.getState()
const exName = id => exerciseNameFor(exOr(id))
const nCount = n => (n === 1 ? t('1 note') : t('{0} notes', n))
const monthLabel = ym => new Date(ym + '-15T12:00:00').toLocaleDateString(getLang() || undefined, { month: 'long', year: 'numeric' })
const noteIcon = n => (n.kind === 'cardio' ? cardioIcon(n.title) || NOTE_KIND_ICON.cardio : NOTE_KIND_ICON[n.kind])
// The note's heading: its exercise, its workout or its kind.
function noteHead(n) {
  if (n.exId) return exName(n.exId)
  if (n.kind === 'workout') return n.title || t('Workout')
  return n.title ? t(n.title) : t(NOTE_KIND_LABEL[n.kind])
}
// What sits under it: where and when.
function noteSub(n) {
  const bits = []
  if (n.d) bits.push(fmtDate(n.d, true))
  if (n.kind === 'exercise') bits.push(n.title)
  if (n.kind === 'standing') bits.push(t('Every session'))
  if (n.kind === 'tip') bits.push(t('In {0}', n.title))
  if (n.pinned) bits.push(t('Shown next time'))
  return bits.filter(Boolean).join(' · ')
}
const copyText = text => (navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard')))

/* ---------------- one note, whole ---------------- */

function NoteView({ n, close }) {
  const S = useStore(s => s.S)
  const nav = useNavigate()
  const w = n.wid ? (S.workouts || []).find(x => String(x.id != null ? x.id : `${x.d}|${x.start}`) === n.wid) : null
  const cardio = n.kind === 'cardio' ? (S.cardioLog || []).find(c => c.id === n.cid) : null
  const go = fn => () => { close(); fn() }
  const actions = [
    w && { icon: 'history', label: t('Open the workout'), onClick: go(() => workoutDetailSheet(w)) },
    n.exId && { icon: 'chartLine', label: t('Exercise history'), onClick: go(() => exerciseHistorySheet(n.exId)) },
    cardio && { icon: 'pencil', label: t('Edit'), onClick: go(() => cardioLogSheet({ entry: cardio })) },
    n.kind === 'tip' && { icon: 'list', label: t('Open the routine'), onClick: go(() => nav('/plan/r/' + n.routineId)) },
    { icon: 'copy', label: t('Copy text'), onClick: () => copyText(n.text).then(() => ui().toast(t('Copied'))).catch(() => ui().toast(t('Could not copy'))) },
  ].filter(Boolean)
  return <>
    <div className="jn-view-kind small muted"><Icon name={noteIcon(n)} />{t(NOTE_KIND_LABEL[n.kind])}</div>
    <h3 className={n.exId ? 'capitalize' : undefined} style={{ marginBottom: 2 }}>{noteHead(n)}</h3>
    {noteSub(n) && <div className="muted small" style={{ marginBottom: 12 }}>{noteSub(n)}</div>}
    <div className="jn-view-text">{n.text}</div>
    <div className="list menu-list" style={{ marginTop: 16 }}>
      {actions.map((a, i) => <div key={i} className="item menu-item" role="button" tabIndex={0} onClick={a.onClick}>
        <span className="lrow-i"><Icon name={a.icon} /></span>
        <div className="grow"><div className="tt">{a.label}</div></div>
      </div>)}
    </div>
  </>
}
export const noteSheet = n => ui().openSheet(close => <NoteView n={n} close={close} />)

/* ---------------- filter sheets ---------------- */

const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v)
function DatesSheet({ filter, onChange, close }) {
  const [from, setFrom] = useState(filter.from || '')
  const [to, setTo] = useState(filter.to || '')
  const today = todayISO()
  const back = days => { const d = new Date(); d.setDate(d.getDate() - days); return isoOf(d) }
  const pick = (f, tt) => { onChange({ ...filter, from: f || undefined, to: tt || undefined }); close() }
  const presets = [
    { label: t('Last 30 days'), f: back(30) },
    { label: t('Last 3 months'), f: back(91) },
    { label: t('This year'), f: today.slice(0, 4) + '-01-01' },
  ]
  const field = (label, value, set, max) => <div className="row between" style={{ marginBottom: 10 }}>
    <span className="small dim">{label}</span>
    <input type="date" className="input pc-date" value={value} max={max} aria-label={label}
      onChange={e => { const v = e.target.value; if (!v || (isDay(v) && v <= today)) set(v) }} />
  </div>
  return <>
    <h3>{t('Dates')}</h3>
    <div className="chips" style={{ flexWrap: 'wrap', margin: '0 0 14px' }}>
      {presets.map(p => <button key={p.label} type="button" className={'chip nocap' + (filter.from === p.f && !filter.to ? ' on' : '')}
        onClick={() => pick(p.f, null)}>{p.label}</button>)}
    </div>
    {field(t('From'), from, setFrom, to || today)}
    {field(t('To'), to, setTo, today)}
    <div style={{ height: 8 }} />
    <Button variant="primary" onClick={() => pick(from, to)}>{t('Show these days')}</Button>
    {(filter.from || filter.to) && <><div style={{ height: 8 }} /><Button variant="ghost" onClick={() => pick(null, null)}>{t('Any day')}</Button></>}
  </>
}

function FolderName({ initial = '', title, onSave, close }) {
  const [name, setName] = useState(initial)
  const ok = name.trim().length > 0
  const save = () => { if (ok) { onSave(name.trim().slice(0, 40)); close() } }
  return <>
    <h3>{title}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('A folder is a saved filter: a note that matches turns up in it, nothing gets moved.')}</div>
    <TextField value={name} maxLength={40} placeholder={t('Like “Shoulder niggles”')} autoFocus
      onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} />
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={!ok} onClick={save}>{t('Save')}</Button>
  </>
}
const folderNameSheet = opts => ui().openSheet(close => <FolderName {...opts} close={close} />)

/* ---------------- the page ---------------- */

const sameFilter = (a, b) => JSON.stringify(normFilter(a)) === JSON.stringify(normFilter(b))
// Kept across visits while the app is open: open a note's workout, come back, and the feed is
// still narrowed the way you left it.
let lastFilter = {}
let lastFolder = null

export default function Journal() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const all = useMemo(() => collectNotes(S), [S.workouts, S.cardioLog, S.exNotes, S.routines]) // eslint-disable-line react-hooks/exhaustive-deps
  const folders = foldersOf(S)
  const [filter, setFilterRaw] = useState(lastFilter)
  const [folderId, setFolderIdRaw] = useState(() => (folders.some(f => f.id === lastFolder) ? lastFolder : null))
  // The search box keeps what was typed (a trailing space included); the filter is its clean form.
  const [typed, setTyped] = useState(lastFilter.q || '')
  const setFilter = f => { lastFilter = normFilter(f); setFilterRaw(lastFilter); if ((lastFilter.q || '') !== typed.trim()) setTyped(lastFilter.q || '') }
  const setFolderId = id => { lastFolder = id; setFolderIdRaw(id) }
  const folder = folders.find(f => f.id === folderId) || null
  const f = normFilter(filter)
  const shown = filterNotes(all, f, exName)
  const counts = kindCounts(filterNotes(all, { ...f, kinds: undefined }, exName))
  const kinds = new Set(f.kinds || [])
  const toggleKind = k => {
    const next = new Set(kinds)
    if (next.has(k)) next.delete(k); else next.add(k)
    setFilter({ ...f, kinds: [...next] })
  }
  const openFolder = fo => {
    if (folder?.id === fo.id) { folderMenu(fo); return }
    setFolderId(fo.id); setFilter(fo.filter)
  }
  const allNotes = () => { setFolderId(null); setFilter({}) }
  const saveFolder = () => folderNameSheet({
    title: t('New folder'),
    onSave: name => {
      const id = uid()
      update(s => { s.journalFolders = withFolder(s.journalFolders, id, { name, filter: f }) })
      setFolderId(id)
      ui().toast(t('Folder “{0}” saved', name))
    },
  })
  const folderMenu = fo => menuSheet({
    title: fo.name,
    items: [
      !sameFilter(fo.filter, f) && { icon: 'check', label: t('Save the current filter here'), onClick: () => update(s => { s.journalFolders = withFolder(s.journalFolders, fo.id, { name: fo.name, filter: f }) }) },
      { icon: 'pencil', label: t('Rename'), onClick: () => folderNameSheet({ title: t('Rename folder'), initial: fo.name, onSave: name => update(s => { s.journalFolders = withFolder(s.journalFolders, fo.id, { name, filter: fo.filter }) }) }) },
      { icon: 'trash', label: t('Delete folder'), danger: true, onClick: () => {
        update(s => { s.journalFolders = withFolder(s.journalFolders, fo.id, null) })
        allNotes()
        ui().toast(t('Folder deleted. The notes stay where they were.'))
      } },
    ],
  })
  const exList = notedExercises(all)
  const pickExercise = () => menuSheet({
    title: t('Exercise'),
    items: [
      { icon: 'list', label: t('Any exercise'), on: !f.exId, onClick: () => setFilter({ ...f, exId: undefined }) },
      ...exList.map(e => ({ icon: 'dumbbell', label: <span className="capitalize">{exName(e.id)}</span>, sub: nCount(e.count), on: f.exId === e.id, onClick: () => setFilter({ ...f, exId: e.id }) })),
    ],
  })
  const pickDates = () => ui().openSheet(close => <DatesSheet filter={f} onChange={setFilter} close={close} />)
  const dateChip = f.from || f.to
    ? (f.from && f.to ? t('{0} to {1}', fmtDate(f.from), fmtDate(f.to)) : f.from ? t('Since {0}', fmtDate(f.from)) : t('Until {0}', fmtDate(f.to)))
    : t('Any day')
  const unsaved = !filterIsEmpty(f) && (!folder || !sameFilter(folder.filter, f))

  // Dated notes by month, then the ones that are true every time.
  const groups = []
  for (const n of shown) {
    const key = n.d ? n.d.slice(0, 7) : 'always'
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) { g = { key, items: [] }; groups.push(g) }
    g.items.push(n)
  }

  return <div className="narrow journal">
    <div className="hdr" style={{ alignItems: 'flex-start', justifyContent: 'flex-start' }}>
      <button className="iconbtn" style={{ flex: 'none' }} onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, minWidth: 0 }}><h1>{t('Journal')}</h1><div className="sub">{nCount(all.length)}</div></div>
    </div>

    <SearchField value={typed} placeholder={t('Search your notes')} aria-label={t('Search your notes')}
      onChange={e => { setTyped(e.target.value); lastFilter = normFilter({ ...f, q: e.target.value }); setFilterRaw(lastFilter) }}
      onClear={() => { setTyped(''); setFilter({ ...f, q: '' }) }} />

    {(folders.length > 0 || unsaved) && <div className="chips jn-folders" role="toolbar" aria-label={t('Folders')}>
      <button type="button" className={'chip nocap' + (!folder && filterIsEmpty(f) ? ' on' : '')} onClick={allNotes}><Icon name="note" />{t('All notes')}</button>
      {folders.map(fo => <button key={fo.id} type="button" className={'chip nocap' + (folder?.id === fo.id ? ' on' : '')}
        aria-pressed={folder?.id === fo.id} onClick={() => openFolder(fo)}>
        <Icon name="folder" />{fo.name}{folder?.id === fo.id && <Icon name="chevronDown" />}</button>)}
      {unsaved && folders.length < FOLDERS_MAX && <button type="button" className="chip nocap jn-save" onClick={saveFolder}><Icon name="plus" />{t('Save as folder')}</button>}
    </div>}

    <div className="chips jn-filters" role="toolbar" aria-label={t('Filter')}>
      <button type="button" className={'chip nocap' + (f.exId ? ' on' : '')} onClick={pickExercise} disabled={!exList.length}>
        <Icon name="dumbbell" /><span className={f.exId ? 'capitalize' : undefined}>{f.exId ? exName(f.exId) : t('Any exercise')}</span><Icon name="chevronDown" /></button>
      <button type="button" className={'chip nocap' + (f.from || f.to ? ' on' : '')} onClick={pickDates}>
        <Icon name="calendar" />{dateChip}<Icon name="chevronDown" /></button>
    </div>
    <div className="chips jn-kinds" role="group" aria-label={t('Kind')}>
      {NOTE_KINDS.filter(k => counts[k] || kinds.has(k)).map(k => <button key={k} type="button" aria-pressed={kinds.has(k)}
        className={'chip nocap' + (kinds.has(k) ? ' on' : '')} onClick={() => toggleKind(k)}>
        <Icon name={NOTE_KIND_ICON[k]} />{t(NOTE_KIND_LABEL[k])}<span className="dim">{counts[k] || 0}</span></button>)}
    </div>

    {!all.length
      ? <div className="empty"><div className="ico"><Icon name="note" /></div>{t('Nothing written down yet. A note on a workout, an exercise or a cardio session lands here, all in one place.')}</div>
      : !shown.length
        ? <div className="empty small jn-none">{t('No note matches. Loosen a filter or two.')}
          <div style={{ height: 10 }} /><Button size="sm" variant="tinted" style={{ margin: '0 auto' }} onClick={allNotes}>{t('Show all notes')}</Button></div>
        : groups.map(g => <section key={g.key} className="jn-group" aria-label={g.key === 'always' ? t('Kept on the exercise') : monthLabel(g.key)}>
          <h4 className="sec">{g.key === 'always' ? t('Kept on the exercise') : monthLabel(g.key)}</h4>
          <div className="list">{g.items.map(n => <div key={n.key} className={'item jn-row jn-' + n.kind} role="button" tabIndex={0} onClick={() => noteSheet(n)}>
            <span className="lrow-i jn-i" aria-hidden="true"><Icon name={noteIcon(n)} /></span>
            <div className="grow">
              <div className="tt"><span className={n.exId ? 'capitalize' : undefined}>{noteHead(n)}</span></div>
              <div className="jn-text">{n.text}</div>
              {noteSub(n) && <div className="ss">{noteSub(n)}</div>}
            </div>
          </div>)}</div>
        </section>)}
  </div>
}
