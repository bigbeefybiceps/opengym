import { supersetUnits, unitOf } from './history.js'

// Swapping one exercise of the running session for another (the exercise's ⋯ menu). Ported from
// upstream openGym.

function hasLoggedSet(entry) {
  return Array.isArray(entry?.sets) && entry.sets.some(set => set?.done === true)
}

/**
 * Swap one exact active-workout occurrence.
 *
 * An exercise with nothing logged yet is replaced in place, and keeps its seat in a superset.
 * Logged results are never relabelled — sets done on the bench press do not become sets of the
 * machine press. There the caller has to confirm first (`loggedConfirmed`), and the replacement
 * is then added after the original (after the whole superset, if it was in one) as an exercise
 * of its own.
 *
 * Returns { inserted, index }, { needsConfirmation } or null when there is nothing to swap.
 */
export function swapActiveExercise(active, index, replacement, { loggedConfirmed = false } = {}) {
  if (!active || !Array.isArray(active.entries) || !replacement || index < 0 || index >= active.entries.length) return null

  const current = active.entries[index]
  if (!hasLoggedSet(current)) {
    active.entries[index] = { ...replacement, ...(current.sg ? { sg: current.sg } : {}) }
    active.cur = index
    return { inserted: false, index }
  }

  if (!loggedConfirmed) return { needsConfirmation: true, index }

  const unit = unitOf(supersetUnits(active.entries), index)
  const insertAt = unit.length > 1 ? unit[unit.length - 1] + 1 : index + 1
  const { sg: _sg, ...alone } = replacement
  active.entries.splice(insertAt, 0, alone)
  active.cur = insertAt
  return { inserted: true, index: insertAt }
}
