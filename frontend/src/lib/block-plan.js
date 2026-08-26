// Which block of a periodised plan a date falls in, counted in whole training weeks from the
// program anchor. The Min-Max plan this was built for runs 6-week blocks in a 12-week cycle:
// weeks 1–6 are Block 1 (week 1 an intro), weeks 7–12 Block 2 (week 7 a deload), and week 13
// starts the cycle — and Block 1 — over.
export const BLOCK_WEEKS = 6
export const CYCLE_WEEKS = 12

// The anchor is the explicit program start when one is set; otherwise the first logged
// workout, so an imported history needs no extra field to know where its weeks count from.
export function programStartOf(S) {
  if (S.programStart) return S.programStart
  let first = null
  for (const w of S.workouts || []) if (w.d && (!first || w.d < first)) first = w.d
  return first
}

// Noon, not midnight: differencing local dates at midnight straddles DST shifts by an hour,
// which floor() would turn into a whole day.
const dayMs = 86400000
const at = iso => new Date(iso + 'T12:00:00').getTime()

/**
 * Where today sits in the plan, or null with no anchor (or a start in the future).
 *
 * @returns {null | {week: number, cycleWeek: number, suggested: 1|2, deload: boolean,
 *   phaseKey: string}} week counts from 1 at the anchor and never resets; cycleWeek wraps
 *   every CYCLE_WEEKS; suggested is the block the plan prescribes for this week; deload marks
 *   the first week of Block 2. phaseKey is stable for one block phase of one cycle — a
 *   dismissed switch-block nudge is scoped to it, so the nudge returns when the next switch
 *   is due rather than on the next visit.
 */
export function blockPlanStatus(S, todayIso) {
  const start = programStartOf(S)
  if (!start) return null
  const days = Math.floor((at(todayIso) - at(start)) / dayMs)
  if (days < 0) return null
  const week = Math.floor(days / 7) + 1
  const cycleWeek = ((week - 1) % CYCLE_WEEKS) + 1
  const suggested = cycleWeek <= BLOCK_WEEKS ? 1 : 2
  return {
    week, cycleWeek, suggested,
    deload: cycleWeek === BLOCK_WEEKS + 1,
    phaseKey: Math.floor((week - 1) / CYCLE_WEEKS) + ':' + suggested,
  }
}
