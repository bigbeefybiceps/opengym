// The training plan: a run of blocks, the week you are in, and what each routine prescribes
// in each block. Pure functions over the state object, like the rest of lib/ — the plan card,
// the routine editor and the session builder all read the same answers from here.
//
// Shape (S.plan):
//   { name, start, after: 'repeat' | 'stay',
//     blocks: [{ id, name, weeks, easy: null | { at: 'first' | 'last', name, pct } }],
//     deloads: [{ d, name, pct }] }
//
// `deloads` are lighter weeks taken on demand rather than on schedule: `d` is the first day of
// the plan week it was called in. Such a week is INSERTED — the plan pauses for it and the
// block picks up afterwards at the week it was on, so a six-week block still gets its six weeks.
//
// A block is a complete prescription, not a flag. Each routine keeps one exercise list per
// block: `routine.ex` is the base list and `routine.alt[blockId]` is a block's own list once
// it has one. A block without its own list reads the base, so a routine created after the
// blocks were set up is the same in every block until you make one of them different.
//
// There is one position, the week, and the block always follows from it. Two positions — a
// week counter and a separately chosen block — is how the app used to end up telling you it
// was week 8 of a plan while showing you Block 1.
import { todayISO } from './format.js'

const clone = o => JSON.parse(JSON.stringify(o))
const dayMs = 86400000
// Noon, not midnight: differencing local dates at midnight straddles DST shifts by an hour,
// which floor() would turn into a whole day.
const at = iso => new Date(iso + 'T12:00:00').getTime()
const isoAdd = (iso, days) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

export const MAX_BLOCKS = 8
export const MAX_BLOCK_WEEKS = 26
const newId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const cleanWeeks = n => Math.max(1, Math.min(MAX_BLOCK_WEEKS, Math.round(n) || 1))
export const cleanPct = n => Math.max(10, Math.min(100, Math.round(n) || 100))

/** The plan, always usable: at least one block, sane lengths. Never mutates S. */
export function planOf(S) {
  const p = (S && S.plan) || {}
  const blocks = (Array.isArray(p.blocks) ? p.blocks : []).filter(b => b && b.id).map(b => ({
    id: b.id,
    name: b.name || '',
    weeks: cleanWeeks(b.weeks),
    easy: b.easy && (b.easy.at === 'first' || b.easy.at === 'last')
      ? { at: b.easy.at, name: b.easy.name || '', pct: cleanPct(b.easy.pct) }
      : null,
  }))
  if (!blocks.length) blocks.push({ id: 'b1', name: '', weeks: 6, easy: null })
  const deloads = (Array.isArray(p.deloads) ? p.deloads : [])
    .filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.d))
    .map(x => ({ d: x.d, name: x.name || '', pct: cleanPct(x.pct) }))
  return {
    name: p.name || '', start: p.start || null, after: p.after === 'stay' ? 'stay' : 'repeat', blocks,
    ...(deloads.length ? { deloads } : {}),
  }
}

export const blockName = (b, i) => (b && b.name) || ('Block ' + (i + 1))

// The anchor is the explicit start when one is set; otherwise the first logged workout, so an
// imported history needs no extra field to know where its weeks count from.
export function programStartOf(S) {
  if (S?.plan?.start) return S.plan.start
  let first = null
  for (const w of S?.workouts || []) if (w.d && (!first || w.d < first)) first = w.d
  return first
}

/**
 * Where a date sits in the plan.
 *
 * `week` counts from 1 inside the current run through the blocks and `total` is the length of
 * that run; `block`, `blockIndex` and `weekInBlock` say where in it. `easy` is the block's
 * lighter week (an intro or a deload) when this is that week, with its `easyName` and `pct`.
 * `cycle` counts completed runs. A plan that stays on its last block keeps counting weeks past
 * the end rather than wrapping.
 *
 * A deload taken on demand is a week outside the count: every later week reads one lower than
 * the calendar says, and the deload week itself reports the position the plan paused at, with
 * `extra` set so the screen can tell it from a scheduled lighter week.
 */
export function planStatus(S, iso = todayISO()) {
  const plan = planOf(S)
  const total = plan.blocks.reduce((n, b) => n + b.weeks, 0)
  const start = programStartOf(S)
  const days = start ? Math.max(0, Math.floor((at(iso) - at(start)) / dayMs)) : 0
  const calWeeks = Math.floor(days / 7)
  const weekStart = start ? isoAdd(start, calWeeks * 7) : iso
  const weekEnd = isoAdd(weekStart, 7)
  const taken = (plan.deloads || []).filter(x => start && x.d >= start)
  const extra = taken.find(x => x.d >= weekStart && x.d < weekEnd) || null
  const elapsed = calWeeks - taken.filter(x => x.d < weekStart).length
  const over = plan.after === 'stay' && elapsed >= total
  const inRun = over ? total - 1 : elapsed % total
  let i = 0, before = 0
  while (i < plan.blocks.length - 1 && inRun >= before + plan.blocks[i].weeks) { before += plan.blocks[i].weeks; i++ }
  const block = plan.blocks[i]
  const weekInBlock = inRun - before + 1
  const scheduled = !over && block.easy &&
    ((block.easy.at === 'first' && weekInBlock === 1) || (block.easy.at === 'last' && weekInBlock === block.weeks))
  // The week the plan resumes on may itself be a scheduled lighter one; the deload you asked
  // for is the one being trained, so its name and percentage win.
  const lighter = extra ? { name: extra.name || 'Deload', pct: extra.pct } : scheduled ? block.easy : null
  return {
    plan, total, block, blockIndex: i,
    week: over ? elapsed + 1 : inRun + 1,
    weekInBlock: over ? block.weeks + (elapsed - total + 1) : weekInBlock,
    cycle: plan.after === 'stay' ? 0 : Math.floor(elapsed / total),
    elapsed, over,
    easy: !!lighter,
    easyName: lighter ? (lighter.name || '') : null,
    pct: lighter ? lighter.pct : 100,
    extra: !!extra, weekStart,
  }
}

export const currentBlockId = (S, iso) => planStatus(S, iso).block.id

/** What a session records about where in the plan it was trained. */
export function weekStamp(st) {
  return {
    w: st.week, of: st.total, b: st.block.id, bn: blockName(st.block, st.blockIndex), wb: st.weekInBlock,
    ...(st.easy ? { easy: st.easyName || 'Lighter week' } : {}),
  }
}
export const isEasySession = w => !!(w && w.wk && w.wk.easy)

/* ----------------------------- moving the position ----------------------------- */
// The position is the start date and nothing else, so moving it is moving that. Stepping back
// a week — you were ill, or travelling — pushes the start a week later; nothing in the log is
// touched, and everything that reads the week (block, lighter weeks, effort targets) follows.
function anchor(s, today) {
  s.plan = s.plan || planOf(s)
  if (!s.plan.start) s.plan.start = programStartOf(s) || today
}
export function shiftWeeks(s, n, today = todayISO()) {
  anchor(s, today)
  const st = planStatus(s, today)
  const by = Math.max(-st.elapsed, Math.round(n) || 0)      // not before week 1
  s.plan.start = isoAdd(s.plan.start, -7 * by)
}
/**
 * Make this week a deload, whatever the block had planned for it. The week is inserted: the
 * plan's count stops for it and carries on next week from the same place. Sessions already
 * finished this week keep what they were — a session records its own week when it is trained.
 */
export function startDeload(s, { name, pct } = {}, today = todayISO()) {
  anchor(s, today)
  const st = planStatus(s, today)
  if (st.extra) return false
  s.plan.deloads = [...(s.plan.deloads || []), { d: st.weekStart, name: String(name || '').slice(0, 24), pct: cleanPct(pct) }]
    .sort((a, b) => (a.d < b.d ? -1 : 1))
  return true
}
/** Call this week's on-demand deload off again; the plan counts the week as a normal one. */
export function cancelDeload(s, today = todayISO()) {
  const st = planStatus(s, today)
  if (!st.extra || !s.plan) return false
  const end = isoAdd(st.weekStart, 7)
  s.plan.deloads = (s.plan.deloads || []).filter(x => !(x.d >= st.weekStart && x.d < end))
  if (!s.plan.deloads.length) delete s.plan.deloads
  return true
}
/**
 * Skip the block's scheduled lighter week: this week becomes the one after it. It is a step
 * forward like any other (the "back one week" button undoes it), offered by name because
 * "skip the intro" is what you mean, not "pretend a week has passed".
 */
export function skipEasyWeek(s, today = todayISO()) {
  const st = planStatus(s, today)
  if (!st.easy || st.extra) return false
  shiftWeeks(s, 1, today)
  return true
}
/** Put today in the first week of `blockId`, in the current run. */
export function jumpToBlock(s, blockId, today = todayISO()) {
  anchor(s, today)
  const st = planStatus(s, today)
  let before = 0
  for (const b of st.plan.blocks) { if (b.id === blockId) break; before += b.weeks }
  const inRun = st.over ? st.total - 1 : st.elapsed % st.total
  shiftWeeks(s, before - inRun, today)
}

/* ------------------------------ per-block exercise lists ------------------------------ */
/** The exercises a routine prescribes in one block. */
export const exOf = (r, blockId) => (blockId && r && r.alt && r.alt[blockId]) || (r && r.ex) || []
/** …and in the block being trained on `iso`. */
export const exNow = (S, r, iso) => exOf(r, currentBlockId(S, iso))
/** Every list a routine holds, for the rare edit that has to reach all of them. */
export const listsOf = r => [r.ex || [], ...Object.values((r && r.alt) || {})]

/**
 * The list to write to when editing `blockId` — call inside store.update, on the draft.
 *
 * A block that still reads the base list gets its own copy the moment it is edited, so a
 * change made while looking at Block 2 lands in Block 2 only. The one exception is the
 * earliest block on the base list: that one owns it, or there would be nobody left who could
 * edit the base at all.
 */
export function ownList(s, r, blockId) {
  const blocks = planOf(s).blocks
  if (!blockId || blocks.length < 2) return r.ex
  if (r.alt && r.alt[blockId]) return r.alt[blockId]
  const owner = blocks.find(b => !(r.alt && r.alt[b.id]))
  if (owner && owner.id === blockId) return r.ex
  r.alt = r.alt || {}
  r.alt[blockId] = clone(r.ex || [])
  return r.alt[blockId]
}

/** Does this block have a list of its own for the routine, or is it reading the base? */
export const hasOwnList = (s, r, blockId) => {
  if (r.alt && r.alt[blockId]) return true
  const owner = planOf(s).blocks.find(b => !(r.alt && r.alt[b.id]))
  return !!owner && owner.id === blockId
}

/* ----------------------------------- editing blocks ----------------------------------- */
/** A new block at the end, starting as a copy of the last one — you only edit what differs. */
export function addBlock(s) {
  s.plan = planOf(s)
  if (s.plan.blocks.length >= MAX_BLOCKS) return null
  const last = s.plan.blocks[s.plan.blocks.length - 1]
  const b = { id: newId(), name: '', weeks: last.weeks, easy: last.easy ? { ...last.easy } : null }
  ;(s.routines || []).forEach(r => {
    r.alt = r.alt || {}
    r.alt[b.id] = clone(exOf(r, last.id))
  })
  s.plan.blocks.push(b)
  return b.id
}

/** Remove a block and its prescriptions. The last block standing cannot be removed. */
export function removeBlock(s, blockId) {
  s.plan = planOf(s)
  if (s.plan.blocks.length < 2) return false
  const rest = s.plan.blocks.filter(b => b.id !== blockId)
  ;(s.routines || []).forEach(r => {
    if (r.alt && r.alt[blockId]) delete r.alt[blockId]
    // The block was the only one reading the base list: the base would be orphaned, holding
    // exercises no block shows. Hand it to the first block left instead.
    else if (!rest.some(b => !(r.alt && r.alt[b.id]))) {
      const heir = rest[0].id
      r.ex = r.alt[heir]
      delete r.alt[heir]
    }
    if (r.alt && !Object.keys(r.alt).length) delete r.alt
  })
  s.plan.blocks = rest
  return true
}

/** Replace one block's list for a routine with a copy of another block's. */
export function copyBlockList(s, r, fromId, toId) {
  const src = clone(exOf(r, fromId))
  const dst = ownList(s, r, toId)
  dst.splice(0, dst.length, ...src)
}

/**
 * Carry one saved change into the routine's other blocks.
 *
 * Only what changed travels. Copying the whole exercise across would overwrite exactly the
 * things blocks exist to hold apart — Block 2's last-set technique would be wiped by a change
 * to a weight step made in Block 1. Matched by exercise; a block that does not have the
 * exercise is left alone.
 */
export function applyToAllBlocks(s, r, blockId, before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  const changed = [...keys].filter(k => k !== 'id' && k !== 'sg' && JSON.stringify((before || {})[k]) !== JSON.stringify((after || {})[k]))
  if (!changed.length) return 0
  let n = 0
  planOf(s).blocks.forEach(b => {
    if (b.id === blockId) return
    const list = ownList(s, r, b.id)
    const hit = list.find(e => e.id === after.id)
    if (!hit) return
    changed.forEach(k => { if (after[k] === undefined) delete hit[k]; else hit[k] = clone(after[k]) })
    n++
  })
  return n
}

/** Does this exercise read differently here than in the plan's first block? */
export function differsFromFirst(S, r, blockId, cfg) {
  const first = planOf(S).blocks[0]
  if (!first || first.id === blockId) return false
  const base = exOf(r, first.id).find(e => e.id === cfg.id)
  if (!base) return true
  const strip = ({ sg, ...rest }) => rest
  return JSON.stringify(strip(base)) !== JSON.stringify(strip(cfg))
}

/* ------------------------------ what a week prescribes ------------------------------ */
/** Which effort scale an exercise's targets are written in, or null if it has none. */
export const effortScale = cfg => (cfg && Array.isArray(cfg.rpe) && cfg.rpe.length ? 'rpe'
  : cfg && Array.isArray(cfg.rir) && cfg.rir.length ? 'rir' : null)

/**
 * The prescription one exercise carries into a session in the week described by `st`.
 *
 * An exercise's config holds two weeks' worth: the normal one, and what its block's lighter
 * week asks for instead (`rirEasy` / `rpeEasy` for effort, `lw` for sets and reps when those
 * differ too). This collapses it to the one that applies. The result is what a session
 * records as its target — what you were told to do — so the alternative it was not told to
 * do is left out of it.
 */
export function weekCfg(cfg, st) {
  const { rirEasy, rpeEasy, lw, ...out } = cfg || {}
  if (!st || !st.easy) return out
  if (Array.isArray(rirEasy) && rirEasy.length) out.rir = rirEasy
  if (Array.isArray(rpeEasy) && rpeEasy.length) out.rpe = rpeEasy
  if (lw && typeof lw === 'object') {
    if (lw.sets > 0) out.sets = lw.sets
    if (lw.reps > 0) { out.reps = lw.reps; if (lw.repsMin > 0) out.repsMin = Math.min(lw.repsMin, lw.reps); else delete out.repsMin }
  }
  return out
}

/* ------------------------------------- migration ------------------------------------- */
/**
 * Bring a state from before plans existed up to this shape. Idempotent; mutates and returns S.
 *
 * Before: one exercise list per routine, a global "block 1 / block 2" switch, a per-exercise
 * `b2` technique that the switch revealed, a `programStart`, and a hard-coded twelve weeks.
 * After: that same programme written out as a plan — two six-week blocks, the second a copy
 * of the first with each technique moved onto the exercise as its `tech`, and the easier RIR
 * the intro and deload weeks used kept as each block's lighter first week.
 *
 * A state that never used any of it (no techniques, no lighter-week targets, block 1) gets a
 * single block and loses nothing. Past sessions are stamped with the week they fell in, which
 * is what lets the lighter ones be told apart later.
 */
export function migratePlan(S) {
  if (!S || typeof S !== 'object') return S
  const done = S.plan && Array.isArray(S.plan.blocks) && S.plan.blocks.length
  if (!done) {
    const routines = S.routines || []
    const hasTech = routines.some(r => (r.ex || []).some(e => e && e.b2))
    const hasEasy = routines.some(r => (r.ex || []).some(e => e && Array.isArray(e.rirEasy) && e.rirEasy.length))
    const twoBlocks = hasTech || S.block === 2
    const lighter = name => (hasEasy ? { at: 'first', name, pct: 100 } : null)
    const blocks = twoBlocks
      ? [{ id: 'b1', name: '', weeks: 6, easy: lighter('Intro') }, { id: 'b2', name: '', weeks: 6, easy: lighter('Deload') }]
      : [{ id: 'b1', name: '', weeks: 6, easy: lighter('Intro') }]
    routines.forEach(r => {
      if (!Array.isArray(r.ex)) r.ex = []
      if (twoBlocks) {
        r.alt = r.alt || {}
        r.alt.b2 = r.ex.map(e => { const { b2, ...rest } = e; return b2 ? { ...clone(rest), tech: b2 } : clone(rest) })
      }
      r.ex.forEach(e => { delete e.b2 })
    })
    // A session in progress keeps showing what it was showing.
    if (S.active && Array.isArray(S.active.entries)) {
      S.active.entries.forEach(en => {
        const tg = en && en.target
        if (!tg || !tg.b2) return
        if (S.block === 2) tg.tech = tg.b2
        delete tg.b2
      })
    }
    S.plan = { name: '', start: S.programStart || null, after: 'repeat', blocks }
    ;(S.workouts || []).forEach(w => { if (w && w.d && !w.wk) w.wk = weekStamp(planStatus(S, w.d)) })
    if (S.active && S.active.d && !S.active.wk) S.active.wk = weekStamp(planStatus(S, S.active.d))
  }
  delete S.block
  delete S.blockNudge
  delete S.programStart
  return S
}
