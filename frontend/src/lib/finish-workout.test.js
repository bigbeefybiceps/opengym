import { describe, expect, it } from 'vitest'
import { buildCompletedWorkout, resumeWorkout, activeMs, elapsedStart } from './finish-workout.js'

describe('completed workout boundary', () => {
  it('builds the same legacy-shaped record doFinishWorkout stores and keeps it visible', () => {
    const active = {
      id: 'active-1', d: '2026-08-08', start: 1000, routineId: 'routine-1', name: 'Push', bw: 80,
      entries: [{ id: '0025', sets: [{ done: true, w: 60, r: 8 }], topW: 60, target: { sets: 1, reps: 8 } }],
    }
    const completed = buildCompletedWorkout(active, { end: 2000, prs: [] })
    expect(completed).toEqual({
      id: 'active-1', d: '2026-08-08', start: 1000, end: 2000, routineId: 'routine-1', name: 'Push', bw: 80,
      entries: [{ id: '0025', sets: [{ done: true, w: 60, r: 8 }], topW: 60, target: { sets: 1, reps: 8 } }],
      prs: []
    })
  })

  it('persists a muscle snapshot only when the caller supplies one', () => {
    const active = {
      id: 'active-1', d: '2026-08-08', start: 1000,
      entries: [
        { id: 'catalogue', sets: [{ done: true }] },
        { id: 'custom', sets: [{ done: true }] },
      ],
    }
    const completed = buildCompletedWorkout(active, {
      end: 2000,
      snapshotFor: entry => entry.id === 'custom'
        ? { n: 'Custom lift', muscleWeights: { chest: 1 } }
        : null,
    })

    expect(completed.entries[0]).not.toHaveProperty('muscleSnapshot')
    expect(completed.entries[1].muscleSnapshot).toEqual({
      n: 'Custom lift', muscleWeights: { chest: 1 },
    })
  })
})

// Notes written during a session have to survive it, or "write a note during your workout"
// means "write a note and lose it when you tap Finish".
describe('session notes', () => {
  const active = (entry) => ({
    id: 'w1', d: '2026-08-25', start: 1, routineId: 'r1', name: 'Push', bw: null,
    entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }], ...entry }],
  })

  it('keeps a per-exercise note and its pin', () => {
    const w = buildCompletedWorkout(active({ note: '  narrower grip next time  ', notePin: true }))
    expect(w.entries[0].note).toBe('narrower grip next time')
    expect(w.entries[0].notePin).toBe(true)
  })

  it('keeps an unpinned note without inventing a pin', () => {
    const w = buildCompletedWorkout(active({ note: 'shoulder twinged' }))
    expect(w.entries[0].note).toBe('shoulder twinged')
    expect('notePin' in w.entries[0]).toBe(false)
  })

  it('writes no note fields at all when nothing was typed', () => {
    const w = buildCompletedWorkout(active({ note: '   ', notePin: true }))
    expect('note' in w.entries[0]).toBe(false)
    expect('notePin' in w.entries[0]).toBe(false)
  })

  it('keeps a whole-session note on the workout', () => {
    const a = active({})
    expect(buildCompletedWorkout({ ...a, note: 'slept badly' }).note).toBe('slept badly')
    expect('note' in buildCompletedWorkout(a)).toBe(false)
  })
})

/* Reopening the day's session, rather than starting a second one against the same plan. */
describe('resuming a finished session', () => {
  const finished = {
    id: 'w1', d: '2026-11-10', start: 1000, end: 4000, routineId: 'r-upper1', name: 'Upper 1',
    bw: 82, note: 'felt good',
    entries: [{ id: '0047', sets: [{ w: 60, r: 8, done: true }], topW: 60, target: { reps: 8 } }],
    prs: ['0047'], vol: 480,
  }

  it('comes back as a live session that saves over the same workout', () => {
    const a = resumeWorkout(finished, 9000)
    expect(a.id).toBe('w1')                      // same id: finishing replaces, never duplicates
    expect(a.d).toBe('2026-11-10')
    expect(a.start).toBe(1000)                   // the real start time, which recovery reads
    expect(a.routineId).toBe('r-upper1')
    expect(a.bw).toBe(82)
    expect(a.note).toBe('felt good')
    expect(a.entries).toEqual(finished.entries)
    expect(a.cur).toBe(0)
  })

  it('keeps a copy to put back if the reopen is discarded', () => {
    expect(resumeWorkout(finished, 9000).resumed.prev).toEqual(finished)
  })

  it('bills the time trained, not the gap before reopening', () => {
    const a = resumeWorkout(finished, 100000)          // reopened long after it was saved
    expect(a.resumed.ms).toBe(3000)                    // what it had already accounted for
    expect(activeMs(a, 100000)).toBe(3000)             // reopening alone adds nothing
    expect(activeMs(a, 102000)).toBe(5000)             // two more seconds of actual training
    // and that is what gets stored as the session's span
    expect(a.start + activeMs(a, 102000) - a.start).toBe(5000)
  })

  it('gives a plain now-minus-start clock a fixed point that shows the same total', () => {
    const a = resumeWorkout(finished, 100000)
    const from = elapsedStart(a)
    expect(100000 - from).toBe(3000)
    expect(102000 - from).toBe(5000)
    expect(elapsedStart(a)).toBe(from)                 // constant, so the clock cannot drift
  })

  it('measures an ordinary session from its start, as before', () => {
    const a = { start: 1000 }
    expect(activeMs(a, 4000)).toBe(3000)
    expect(elapsedStart(a)).toBe(1000)
    expect(activeMs(null)).toBe(0)
  })

  it('survives a workout that never recorded an end', () => {
    const a = resumeWorkout({ ...finished, end: undefined }, 9000)
    expect(a.resumed.ms).toBe(0)
  })
})

/* "Opens as it was": finish, reopen, and the session on screen is the one you left. */
describe('a reopened session is the session you left', () => {
  const done = (w, r) => ({ w, r, done: true })
  const open = (w, r) => ({ w, r, done: false })
  const active = {
    id: 'w9', d: '2026-11-13', start: 1000, routineId: 'r-upper1', name: 'Upper 1', bw: null, cur: 2,
    entries: [
      { id: 'A', sets: [done(60, 8), done(60, 7)], target: { reps: 8 }, plan: { kind: 'hold', why: ['Same weight'] } },
      { id: 'B', sets: [open(40, 8), open(40, 8)], target: { reps: 8 }, plan: { kind: 'up', why: ['More'] } },   // never touched
      { id: 'C', sg: 'g1', sets: [done(20, 10), open(20, 10)], target: { reps: 10 }, asked: true },             // half done
      { id: 'D', sg: 'g1', sets: [open(15, 12)], target: { reps: 12 } },                                         // never touched
    ],
  }
  const saved = buildCompletedWorkout(active, { end: 5000 })

  it('still keeps untouched exercises out of history itself', () => {
    expect(saved.entries.map(e => e.id)).toEqual(['A', 'C'])
  })

  it('brings every exercise back, in the order it was in', () => {
    expect(resumeWorkout(saved, 9000).entries.map(e => e.id)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('brings back unticked sets — on a half-done exercise and an untouched one alike', () => {
    const e = resumeWorkout(saved, 9000).entries
    expect(e[1].sets).toEqual([open(40, 8), open(40, 8)])
    expect(e[2].sets).toEqual([done(20, 10), open(20, 10)])
    expect(e[3].sets).toEqual([open(15, 12)])
  })

  it('brings back the pairing, the prescription and your place', () => {
    const a = resumeWorkout(saved, 9000)
    expect(a.entries[2].sg).toBe('g1')
    expect(a.entries[3].sg).toBe('g1')
    expect(a.entries[0].plan).toEqual({ kind: 'hold', why: ['Same weight'] })
    expect(a.entries[1].plan).toEqual({ kind: 'up', why: ['More'] })
    expect(a.entries[2].asked).toBe(true)
    expect(a.cur).toBe(2)
  })

  it('round-trips: finishing the reopened session unchanged saves the same workout', () => {
    const again = buildCompletedWorkout(resumeWorkout(saved, 9000), { end: 5000 })
    expect(again.entries).toEqual(saved.entries)
    expect(again.resume).toEqual(saved.resume)
  })

  it('lets a correction made in history win over the stash', () => {
    const edited = JSON.parse(JSON.stringify(saved))
    edited.entries[0].sets[0].r = 9                    // fixed afterwards via Edit sets
    expect(resumeWorkout(edited, 9000).entries[0].sets[0].r).toBe(9)
  })

  it('adds nothing to a session that was logged in full from the first exercise', () => {
    const plain = buildCompletedWorkout({ id: 'p', d: '2026-11-13', start: 1, entries: [{ id: 'A', sets: [done(60, 8)] }] }, { end: 2 })
    expect('resume' in plain).toBe(false)
  })

  it('reopens a session saved before any of this existed', () => {
    const old = { id: 'o', d: '2026-11-13', start: 1, end: 2, entries: [{ id: 'A', sets: [done(60, 8)] }] }
    const a = resumeWorkout(old, 9)
    expect(a.entries.map(e => e.id)).toEqual(['A'])
    expect(a.cur).toBe(0)
  })
})
