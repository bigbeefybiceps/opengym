// The pure pieces behind the workout's ⋯ menus: an exercise's own rest, swapping, reordering,
// the layout choice and the muscle filter.
import { describe, it, expect } from 'vitest'
import { ownExerciseRest, withExerciseRest, restSecFor, fmtRest } from './supersetFlow.js'
import { swapActiveExercise } from './active-exercise-swap.js'
import { moveActiveWorkoutEntry, canMoveActiveWorkoutEntry } from './active-workout-order.js'
import { workoutViewOf, setWorkoutView } from './workout-layout.js'
import { MUSCLE_GROUPS, groupTerm, toggleTerm, matchesTerms, shownMuscles, termsWeight } from './muscle-filter.js'
import { MUSCLES } from './muscles.js'
import { exerciseHistory } from './exercise-history.js'
import { youtubeSearchUrl } from './youtube.js'
import { buildPlanBundle } from './plan-share.js'

const set = (done = false) => ({ w: 50, r: 8, done })
const entry = (id, extra = {}) => ({ id, target: { sets: 2, reps: 8 }, sets: [set(), set()], ...extra })

describe('an exercise’s own rest', () => {
  it('reads a time, "no timer" and "follow the default" apart', () => {
    expect(ownExerciseRest({ restSec: 120 })).toBe(120)
    expect(ownExerciseRest({ restOff: true, restSec: 120 })).toBe(0)
    expect(ownExerciseRest({ reps: 8 })).toBeNull()
    expect(ownExerciseRest(null)).toBeNull()
  })
  it('sets and clears it without touching the rest of the target', () => {
    const t0 = { sets: 2, reps: 8 }
    expect(withExerciseRest(t0, 150)).toEqual({ sets: 2, reps: 8, restSec: 150 })
    expect(withExerciseRest({ ...t0, restSec: 150 }, 0)).toEqual({ sets: 2, reps: 8, restOff: true })
    expect(withExerciseRest({ ...t0, restOff: true }, null)).toEqual(t0)
    expect(t0).toEqual({ sets: 2, reps: 8 })
  })
  it('rests a lone exercise its own time and a superset its longest', () => {
    const entries = [entry('a', { target: { restSec: 180 } }), entry('b'), entry('c', { target: { restOff: true } }), entry('d', { target: { restSec: 60 } })]
    expect(restSecFor(entries, [0], 90)).toBe(180)
    expect(restSecFor(entries, [1], 90)).toBe(90)
    expect(restSecFor(entries, [2], 90)).toBe(0)
    expect(restSecFor(entries, [0, 3], 90)).toBe(180)
    expect(restSecFor(entries, [1, 3], 90)).toBe(60)
    expect(restSecFor(entries, [2, 3], 90)).toBe(60)
  })
  it('formats like the timer and travels in a shared plan', () => {
    expect(fmtRest(90)).toBe('1:30')
    expect(fmtRest(45)).toBe('0:45')
    const bundle = buildPlanBundle({ routines: [{ id: 'r', name: 'R', ex: [{ id: '0047', sets: 2, reps: 8, restSec: 150 }, { id: '0596', sets: 2, reps: 8, restOff: true }] }], week: {} })
    expect(bundle.routines[0].ex[0].restSec).toBe(150)
    expect(bundle.routines[0].ex[1].restOff).toBe(true)
  })
})

describe('swapping an exercise mid-workout', () => {
  it('replaces an untouched exercise in place and keeps its seat in a superset', () => {
    const active = { cur: 0, entries: [entry('a', { sg: 'g' }), entry('b', { sg: 'g' })] }
    expect(swapActiveExercise(active, 1, entry('z'))).toEqual({ inserted: false, index: 1 })
    expect(active.entries.map(e => [e.id, e.sg])).toEqual([['a', 'g'], ['z', 'g']])
    expect(active.cur).toBe(1)
  })
  it('never relabels logged sets: it asks, then adds the replacement after', () => {
    const active = { cur: 0, entries: [entry('a', { sets: [set(true), set()] }), entry('b')] }
    expect(swapActiveExercise(active, 0, entry('z'))).toMatchObject({ needsConfirmation: true })
    expect(active.entries.map(e => e.id)).toEqual(['a', 'b'])
    expect(swapActiveExercise(active, 0, entry('z'), { loggedConfirmed: true })).toEqual({ inserted: true, index: 1 })
    expect(active.entries.map(e => e.id)).toEqual(['a', 'z', 'b'])
    expect(active.entries[0].sets[0].done).toBe(true)
  })
  it('adds the replacement of a logged superset member after the whole superset', () => {
    const active = { cur: 0, entries: [entry('a', { sg: 'g', sets: [set(true)] }), entry('b', { sg: 'g' }), entry('c')] }
    swapActiveExercise(active, 0, entry('z', { sg: 'other' }), { loggedConfirmed: true })
    expect(active.entries.map(e => e.id)).toEqual(['a', 'b', 'z', 'c'])
    expect(active.entries[2].sg).toBeUndefined()
  })
  it('refuses an index that is not there', () => {
    expect(swapActiveExercise({ entries: [] }, 0, entry('z'))).toBeNull()
    expect(swapActiveExercise(null, 0, entry('z'))).toBeNull()
  })
})

describe('moving an exercise mid-workout', () => {
  it('moves a lone exercise past a whole superset and keeps the marker on it', () => {
    const active = { cur: 2, entries: [entry('a', { sg: 'g' }), entry('b', { sg: 'g' }), entry('c')] }
    expect(canMoveActiveWorkoutEntry(active, 2, 1)).toBe(false)
    expect(moveActiveWorkoutEntry(active, 2, -1)).toEqual({ indices: [2, 0, 1] })
    expect(active.entries.map(e => e.id)).toEqual(['c', 'a', 'b'])
    expect(active.cur).toBe(0)
  })
  it('swaps two members inside a superset when the marker is elsewhere', () => {
    const active = { cur: 2, entries: [entry('a', { sg: 'g' }), entry('b', { sg: 'g' }), entry('c')] }
    moveActiveWorkoutEntry(active, 0, 1)
    expect(active.entries.map(e => e.id)).toEqual(['b', 'a', 'c'])
    expect(active.entries.slice(0, 2).every(e => e.sg === 'g')).toBe(true)
  })
})

describe('the workout layout', () => {
  it('defaults to cards, prefers the session’s choice, and remembers a new one', () => {
    expect(workoutViewOf({})).toBe('cards')
    expect(workoutViewOf({ workoutView: 'list' })).toBe('list')
    expect(workoutViewOf({ workoutView: 'list', active: { workoutView: 'compact' } })).toBe('compact')
    expect(workoutViewOf({ workoutView: 'focus' })).toBe('cards')
    const s = { active: {} }
    setWorkoutView(s, 'compact')
    expect(s).toEqual({ workoutView: 'compact', active: { workoutView: 'compact' } })
    setWorkoutView(s, 'nonsense')
    expect(s.workoutView).toBe('compact')
  })
})

describe('the muscle filter', () => {
  it('only opens groups into muscles the body map draws, each exactly once', () => {
    const all = MUSCLE_GROUPS.flatMap(g => g.muscles)
    expect(all.every(m => MUSCLES.includes(m))).toBe(true)
    expect([...all].sort()).toEqual([...MUSCLES].sort())
  })
  it('matches all terms by default, any on request, and a group by any of its muscles', () => {
    const w = { chest: 1, triceps: 0.5 }
    expect(matchesTerms(w, ['chest', 'triceps'])).toBe(true)
    expect(matchesTerms(w, ['chest', 'biceps'])).toBe(false)
    expect(matchesTerms(w, ['chest', 'biceps'], 'any')).toBe(true)
    expect(matchesTerms(w, [groupTerm('arms')])).toBe(true)
    expect(matchesTerms(w, [])).toBe(false)
    expect(termsWeight(w, [groupTerm('arms')])).toBe(0.5)
  })
  it('lets a group and one of its muscles replace each other', () => {
    expect(toggleTerm(['biceps'], groupTerm('arms'))).toEqual([groupTerm('arms')])
    expect(toggleTerm([groupTerm('arms')], 'triceps')).toEqual(['triceps'])
    expect(toggleTerm(['chest', 'triceps'], 'chest')).toEqual(['triceps'])
    expect(shownMuscles([groupTerm('core')])).toEqual(['abs', 'obliques'])
  })
})

describe('exerciseHistory', () => {
  const w = (d, sets, id = d) => ({ id, d, start: Date.parse(d), entries: [{ id: '0047', target: { reps: 8 }, sets }] })
  const S = { workouts: [
    w('2026-10-01', [{ w: 60, r: 8, done: true }, { w: 60, r: 7, done: true }]),
    w('2026-10-08', [{ w: 40, r: 8, done: true, phase: 'warmup' }, { w: 62.5, r: 8, done: true }, { w: 62.5, r: 6, done: false }]),
    { id: 'x', d: '2026-10-09', start: 1, entries: [{ id: '0596', sets: [{ w: 99, r: 5, done: true }] }] },
  ] }
  it('plots the heaviest finished work set per session, newest session first in the list', () => {
    const h = exerciseHistory(S, '0047')
    expect(h.metric).toBe('weight')
    expect(h.points.map(p => p.y)).toEqual([60, 62.5])
    expect(h.best).toBe(62.5)
    expect(h.total).toBe(2)
    expect(h.sessions.map(s => s.d)).toEqual(['2026-10-08', '2026-10-01'])
    expect(h.sessions[0].sets).toHaveLength(1)
    expect(h.e1rmPoints).toHaveLength(2)
  })
  it('is empty, not broken, for an exercise never trained', () => {
    expect(exerciseHistory(S, '9999')).toMatchObject({ total: 0, points: [], sessions: [], best: 0 })
    expect(exerciseHistory({}, '0047').total).toBe(0)
  })
})

describe('youtubeSearchUrl', () => {
  it('searches the exercise name plus "form", and nothing for a nameless exercise', () => {
    expect(youtubeSearchUrl({ n: 'barbell  bench press' })).toBe('https://www.youtube.com/results?search_query=barbell+bench+press+form')
    expect(youtubeSearchUrl({ n: '  ' })).toBeNull()
    expect(youtubeSearchUrl(null)).toBeNull()
  })
})
