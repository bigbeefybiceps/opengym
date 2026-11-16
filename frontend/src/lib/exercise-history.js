// What you did on one exercise before, for the history sheet you can open mid-workout (the
// exercise's ⋯ menu) and from the journal: one point per session for the curve, and the sessions
// themselves set by set, newest first.
//
// Ported from upstream openGym's exercise history. Sessions are read the way Stats → Exercise
// progress reads them (metricModeForEntry / metricRowsForEntry), so the two never disagree about
// what a session's best was.
import { modeOf, metricModeForEntry, metricRowsForEntry, bestWeightForEntry } from './history.js'
import { e1rmSeries } from './onerm.js'

export const HISTORY_SESSIONS = 12

/**
 * { mode, metric, points, e1rmPoints, sessions, best, total }
 *   mode    'reps' | 'time' | 'cardio', as the exercise was last logged
 *   metric  what `points` and `best` measure: 'weight' | 'reps' | 'sec' | 'speed'
 *   points  [{ t, y, d }] oldest first, one per session with a value
 *   sessions the last HISTORY_SESSIONS as { id, d, sets, target, value }, newest first
 *   total   how many sessions the exercise has in all
 */
export function exerciseHistory(S, exId) {
  const hits = []
  for (const w of Array.isArray(S?.workouts) ? S.workouts : []) {
    const en = (w?.entries || []).find(e => e && e.id === exId)
    if (en) hits.push({ w, en })
  }
  const mode = hits.length
    ? metricModeForEntry(hits[hits.length - 1].en, modeOf({ id: exId }))
    : modeOf({ id: exId })
  const same = hits.filter(h => metricModeForEntry(h.en, mode) === mode)
  // Bodyweight work with no load anywhere has nothing to plot but the rep count.
  const repsOnly = mode === 'reps' && !same.some(h => bestWeightForEntry(h.en) > 0)
  const metric = mode === 'cardio' ? 'speed' : mode === 'time' ? 'sec' : repsOnly ? 'reps' : 'weight'
  const valueOf = (en, rows) => {
    if (metric === 'weight') return bestWeightForEntry(en)
    const f = metric === 'reps' ? 'r' : metric
    return Math.max(0, ...rows.map(s => Number(s[f]) || 0))
  }
  const rows = []
  for (const { w, en } of same) {
    const sets = metricRowsForEntry(en, mode)
    if (!sets.length) continue
    rows.push({ id: w.id, d: w.d, t: w.start, sets, target: en.target || null, value: valueOf(en, sets) })
  }
  const points = rows.filter(r => r.value > 0).map(r => ({ t: r.t, y: r.value, d: r.d }))
  return {
    mode, metric, points,
    e1rmPoints: metric === 'weight' ? e1rmSeries(S, exId).map(p => ({ t: p.t, y: p.y, d: p.d })) : [],
    sessions: rows.slice(-HISTORY_SESSIONS).reverse(),
    best: Math.max(0, ...points.map(p => p.y)),
    total: rows.length,
  }
}
