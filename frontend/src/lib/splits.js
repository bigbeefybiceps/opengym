// Workout splits: named groups of routines, each with its own training plan and week schedule.
//
// Shape:
//   S.splits = [{ id, plan?, week?, pausedAt? }]   S.split = the active split's id
//   routine.split = a split id, or absent for a routine that is in no split
//
// One split is active at a time, and the active one's plan and week ARE `S.plan` and `S.week`
// — everything that already reads those (the plan card, Home, reminders, the session builder)
// keeps working unchanged and simply sees the active split. An inactive split carries its own
// `plan` and `week` on its entry, plus `pausedAt`: the day it was switched away from. A paused
// split does not move on — switching back resumes it at the week it was left on.
//
// A split's name is its plan's name, so there is one place to rename it.
//
// Blocks belong to a split. A routine's per-block lists (`routine.alt`) are keyed by its own
// split's block ids, so a routine of a paused split is still read — and edited — against that
// split's blocks, at the block the split was paused in. A routine in no split follows the
// active split, as every routine did before splits existed.
import { todayISO } from './format.js'
import { planOf, planStatus, programStartOf, shiftWeeks } from './block-plan.js'

const clone = o => JSON.parse(JSON.stringify(o))
const newId = () => 'sp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
export const MAX_SPLITS = 12

export const splitsOf = S => (Array.isArray(S && S.splits) ? S.splits : [])
export const activeSplitId = S => (S && S.split) || null
export const splitById = (S, id) => splitsOf(S).find(x => x.id === id) || null
export const isActiveSplit = (S, id) => !!id && id === activeSplitId(S)

/** The plan of any split — the live one for the active split, the stored one otherwise. */
export const splitPlan = (S, sp) => planOf(isActiveSplit(S, sp && sp.id) ? S : { plan: sp && sp.plan })
export const splitName = (S, sp) => splitPlan(S, sp).name || 'Training plan'
export const splitWeek = (S, sp) => (isActiveSplit(S, sp && sp.id) ? S.week : sp && sp.week) || {}
export const routinesIn = (S, id) => (S.routines || []).filter(r => (r.split || null) === (id || null))
export const loose = S => routinesIn(S, null)

/**
 * The paused split a routine belongs to, or null when the routine follows the active plan
 * (it is in the active split, in no split, or names a split that no longer exists).
 */
export function pausedSplitOf(S, r) {
  if (!r || !r.split || r.split === activeSplitId(S)) return null
  return splitById(S, r.split)
}

/**
 * The state the plan functions should read for this routine: S itself, or a stand-in carrying
 * the routine's paused split's plan. Everything in block-plan.js that takes `S` and a routine
 * goes through here, so a paused split's routine never gets the active split's blocks.
 */
export function planHost(S, r) {
  const sp = pausedSplitOf(S, r)
  return sp ? { plan: sp.plan || {}, workouts: S.workouts } : S
}

/** Where a routine is in its plan on `iso`; a paused split stays where it was paused. */
export function routineStatus(S, r, iso = todayISO()) {
  const sp = pausedSplitOf(S, r)
  if (!sp) return planStatus(S, iso)
  const at = sp.pausedAt && sp.pausedAt < iso ? sp.pausedAt : iso
  return planStatus(planHost(S, r), at)
}

/* --------------------------------------- migration --------------------------------------- */
/**
 * Give a state from before splits its first one: the plan it has, holding the routines its
 * week schedule uses. Routines the schedule doesn't use stay in no split — nothing about how
 * any routine trains changes, they are only sorted. Idempotent; mutates and returns S.
 */
export function migrateSplits(S) {
  if (!S || typeof S !== 'object') return S
  if (!Array.isArray(S.splits)) S.splits = []
  // Drop anything unusable, and keep the active id pointing at a real split.
  S.splits = S.splits.filter(x => x && x.id)
  if (!S.splits.length) {
    const id = newId()
    S.splits.push({ id })
    S.split = id
    const used = new Set(Object.values(S.week || {}).filter(Boolean))
    ;(S.routines || []).forEach(r => { if (used.has(r.id) && !r.split) r.split = id })
  }
  if (!splitById(S, S.split)) S.split = S.splits[0].id
  const cur = splitById(S, S.split)
  delete cur.plan; delete cur.week; delete cur.pausedAt
  const ids = new Set(S.splits.map(x => x.id))
  ;(S.routines || []).forEach(r => { if (r.split && !ids.has(r.split)) delete r.split })
  return S
}

/* ---------------------------------------- editing ---------------------------------------- */
/**
 * A new, paused split. `blocksFrom` copies another split's block layout — same ids, so a
 * routine moved between the two keeps its per-block lists. Otherwise it gets one block.
 * Its week 1 starts the day it is first switched to.
 */
export function addSplit(s, { name = '', blocksFrom = null } = {}) {
  if (splitsOf(s).length >= MAX_SPLITS) return null
  const src = blocksFrom ? splitById(s, blocksFrom) : null
  const blocks = src
    ? splitPlan(s, src).blocks.map(b => clone(b))
    : [{ id: 'b' + Date.now().toString(36), name: '', weeks: 6, easy: null }]
  const id = newId()
  s.splits.push({ id, plan: { name: String(name).slice(0, 40), start: null, after: 'repeat', blocks }, week: {} })
  return id
}

export function renameSplit(s, id, name) {
  const sp = splitById(s, id)
  if (!sp) return
  const v = String(name || '').slice(0, 40)
  if (isActiveSplit(s, id)) { s.plan = planOf(s); s.plan.name = v } else { sp.plan = sp.plan || {}; sp.plan.name = v }
}

/**
 * Make `id` the active split. The current one is paused where it is (its plan, week and the
 * day it stopped go onto its entry), and the new one comes back at the week it was paused on —
 * a split you take a month off from doesn't count that month as training. A split that has
 * never run starts at week 1 today.
 */
export function activateSplit(s, id, today = todayISO()) {
  const next = splitById(s, id)
  const cur = splitById(s, s.split)
  if (!next || next === cur) return false
  if (cur) {
    s.plan = planOf(s)
    if (!s.plan.start) s.plan.start = programStartOf(s) || today
    cur.plan = s.plan
    cur.week = s.week || {}
    cur.pausedAt = today
  }
  const plan = planOf({ plan: next.plan })
  const resumeAt = next.pausedAt && plan.start ? next.pausedAt : null
  s.plan = plan
  s.week = next.week || {}
  s.split = id
  delete next.plan; delete next.week; delete next.pausedAt
  if (!plan.start) s.plan.start = today
  else if (resumeAt && resumeAt < today) {
    const was = planStatus(s, resumeAt).elapsed
    const now = planStatus(s, today).elapsed
    if (now !== was) shiftWeeks(s, was - now, today)
  }
  return true
}

/**
 * Put a routine in a split (or in none, with `id` null). It comes off the old split's week
 * schedule if that schedule used it — a split's week only holds its own routines and loose
 * ones. Returns how many days it was taken off.
 */
export function moveRoutine(s, routineId, id) {
  const r = (s.routines || []).find(x => x.id === routineId)
  if (!r) return 0
  const from = r.split || null
  const to = id && splitById(s, id) ? id : null
  if (from === to) return 0
  let dropped = 0
  if (from && to) {   // into no split, it can stay on the days it had
    const week = isActiveSplit(s, from) ? s.week : (splitById(s, from) || {}).week
    if (week) Object.keys(week).forEach(d => { if (week[d] === routineId) { delete week[d]; dropped++ } })
  }
  if (to) r.split = to; else delete r.split
  return dropped
}

/**
 * Delete a paused split. Its routines are kept, in no split, unless `withRoutines` — then they
 * go too, along with any day override that pointed at them. The active split can't be deleted:
 * switch away from it first.
 */
export function removeSplit(s, id, { withRoutines = false } = {}) {
  if (isActiveSplit(s, id) || !splitById(s, id)) return false
  const mine = new Set(routinesIn(s, id).map(r => r.id))
  if (withRoutines) {
    s.routines = s.routines.filter(r => !mine.has(r.id))
    Object.keys(s.week || {}).forEach(d => { if (mine.has(s.week[d])) delete s.week[d] })
    Object.keys(s.dayPlan || {}).forEach(d => { if (mine.has(s.dayPlan[d])) delete s.dayPlan[d] })
    s.splits.forEach(x => { if (x.week) Object.keys(x.week).forEach(d => { if (mine.has(x.week[d])) delete x.week[d] }) })
  } else s.routines.forEach(r => { if (mine.has(r.id)) delete r.split })
  s.splits = s.splits.filter(x => x.id !== id)
  return true
}

/** Forget a deleted routine everywhere a split keeps it. */
export function forgetRoutine(s, routineId) {
  splitsOf(s).forEach(x => { if (x.week) Object.keys(x.week).forEach(d => { if (x.week[d] === routineId) delete x.week[d] }) })
}

/** The routines you can pick for a day or a session from the active split: its own, then loose ones. */
export const pickable = S => [...routinesIn(S, activeSplitId(S)), ...loose(S)]
