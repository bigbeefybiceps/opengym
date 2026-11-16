// Pure decisions for the active-workout superset flow. Keeping these independent of React and
// the stores makes the uneven-round and re-check rules explicit and directly testable.
const hasWork = (entries, idx) => !!entries[idx]?.sets?.some(set => !set.done)

// A completion is new progress only when it takes this exercise beyond the largest number of
// simultaneously completed sets seen in this mounted session. Uncheck/re-check therefore does
// not repeat navigation or rest side effects, while completing an added set still can.
export function setProgressHighWater(entry, previous = 0) {
  const done = entry?.sets?.reduce((count, set) => count + (set.done ? 1 : 0), 0) || 0
  return { isNew: done > previous, highWater: Math.max(previous, done) }
}

/**
 * Whether completing a set should start a rest timer.
 *
 * A rest belongs after every completed set — the last set of an exercise included, because
 * another exercise follows it and you rest before that one too. The only set with nothing
 * left to time is the last set of the last exercise, where the session is over.
 *
 * Ordinary exercises used to "finish quietly" instead: an exercise started no rest on its
 * closing set, so a two-set exercise timed one rest instead of two (issue #3) and a rest
 * never carried across the gap into the next exercise. Supersets already did it this way.
 */
export function restAfterSet({ unitDone, lastUnit }) {
  return !unitDone || !lastUnit
}

/**
 * Whether re-checking an already-completed set should start a rest.
 *
 * The high-water rule deliberately swallows a re-check so that unchecking and re-checking
 * finished work does not replay navigation or reopen sheets. But a re-check is still you
 * telling the app a set is done, and that is the other half of issue #3 — "after the first
 * set, sometimes a break doesn't appear". That is what it looks like when you uncheck a set
 * to correct the reps after its rest has already run out: nothing times the rest you are
 * actually about to take.
 *
 * So: fill a gap, never disturb a rest that is already counting down. A timer that is running
 * belongs to the set you finished most recently, which is a better answer than restarting it.
 */
export function restOnRecheck({ timerRunning, unitDone, lastUnit }) {
  return !timerRunning && restAfterSet({ unitDone, lastUnit })
}

// Decide where a newly completed superset set goes next. Spent members are skipped, including
// across the wrap. A round ends when no later member in display order has work left; this makes
// the last *active* member the boundary rather than blindly using the group's last array index.
export function supersetFlowStep(entries, unit, fromIdx) {
  if (!Array.isArray(entries) || !Array.isArray(unit) || unit.length <= 1) return null
  const pos = unit.indexOf(fromIdx)
  if (pos < 0) return null

  const unitDone = !unit.some(idx => hasWork(entries, idx))
  if (unitDone) return { unitDone: true, roundDone: false, nextIdx: null }

  const wrapped = [...unit.slice(pos + 1), ...unit.slice(0, pos + 1)]
  const nextIdx = wrapped.find(idx => hasWork(entries, idx)) ?? null
  const roundDone = !unit.slice(pos + 1).some(idx => hasWork(entries, idx))
  return { unitDone: false, roundDone, nextIdx }
}

/* ---------- an exercise's own rest ---------- */
// Set from the exercise's ⋯ menu during a workout (ported from upstream openGym). It lives on
// the exercise's target — `restSec` for a time of its own, `restOff` for no timer — beside the
// sets and reps it belongs to, so it travels with the plan and is recorded with the session.

/** The exercise's own rest: seconds, 0 for "no timer", null when it follows the default. */
export function ownExerciseRest(target) {
  if (!target) return null
  if (target.restOff === true) return 0
  const sec = Number(target.restSec)
  return sec > 0 ? Math.round(sec) : null
}

/** `target` with its own rest set to `sec` — null back to the default, 0 for no timer. */
export function withExerciseRest(target, sec) {
  const { restSec: _sec, restOff: _off, ...rest } = target || {}
  if (sec == null) return rest
  return sec > 0 ? { ...rest, restSec: Math.round(sec) } : { ...rest, restOff: true }
}

/**
 * How long to rest after a set of `unit` (the entry indexes of one exercise or one superset).
 * A lone exercise rests its own time, or the default. A superset rests once per round, so it
 * takes the longest rest any of its members asks for; members that say nothing do not vote,
 * and it only goes without a timer when every member that has a say says so. 0 = no timer.
 */
export function restSecFor(entries, unit, dflt) {
  const own = (unit || []).map(i => ownExerciseRest(entries?.[i]?.target)).filter(v => v != null)
  return own.length ? Math.max(...own) : dflt
}

/** "1:30" for a rest — minutes and seconds, the way the timer itself counts. */
export const fmtRest = sec => {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}
