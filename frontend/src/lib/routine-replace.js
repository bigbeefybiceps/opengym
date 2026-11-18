// Replacing one exercise of a routine with another, in the same place.
//
// What carries over is the prescription — sets, reps and range, effort targets, the last-set
// technique, warm-ups, rest, the lighter week, the progression rule, a superset seat. What
// does not is what belongs to the old movement: its weight (a machine press is not loaded like
// a barbell press), its note (loading cues), its weight step, and whether it is bodyweight or
// done per side — those come from the new exercise. Moving between cardio and lifting carries
// nothing, since the two have no fields in common.
import { defaultConfig, modeOf } from './history.js'

const MOVEMENT = ['id', 'sg', 'weight', 'note', 'bodyweight', 'side', 'inc', 'repsMax']

/** The config the replacement starts from, before you review it. */
export function carryConfig(old, newId) {
  const oldMode = modeOf(old || {})
  const newMode = modeOf({ id: newId })
  if ((oldMode === 'cardio') !== (newMode === 'cardio')) return defaultConfig(newId)
  const out = { ...defaultConfig(newId, newMode === 'cardio' ? 'cardio' : oldMode) }
  Object.entries(old || {}).forEach(([k, v]) => { if (!MOVEMENT.includes(k)) out[k] = JSON.parse(JSON.stringify(v)) })
  return out
}

/** Put `cfg` for `newId` at index `i`, in the old exercise's superset seat. */
export function replaceAt(list, i, newId, cfg) {
  const before = list[i]
  if (!before) return false
  list[i] = { id: newId, ...(before.sg ? { sg: before.sg } : {}), ...cfg }
  return true
}

/**
 * The same replacement in another block's list: the old exercise, wherever it sits there, swaps
 * to the new one keeping that block's own prescription. Returns whether it was found.
 */
export function replaceIn(list, oldId, newId) {
  const i = list.findIndex(e => e.id === oldId)
  if (i < 0) return false
  return replaceAt(list, i, newId, carryConfig(list[i], newId))
}
