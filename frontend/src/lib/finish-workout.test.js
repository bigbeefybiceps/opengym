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
