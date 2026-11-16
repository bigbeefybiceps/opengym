// Planned cardio, and the log of what was done.
//
// Cardio is planned per weekday rather than inside a routine, because that is what it
// belongs to: "twenty minutes on the incline after upper days, a longer bike on Wednesday".
// Tied to a routine it would follow the routine when a day is rescheduled, could not exist
// on a rest day, and would count its minutes into the lifting session.
//
// It is logged the same way — its own small entry for the day, not a set in a workout — so
// the lifting session's duration stays the lifting session's, and reopening or discarding a
// workout never touches it.
//
//   S.cardio    { [weekday 0-6]: { mod, min, note? } }        the plan
//   S.cardioLog [{ id, d, mod, min, dist?, note? }]           what was done
import { isoOf } from './format.js'

export const MODALITIES = ['Incline walk', 'Treadmill run', 'Bike', 'Stair climber', 'Rower', 'Elliptical', 'Outdoor walk', 'Outdoor run', 'Swim']
export const CARDIO_NOTE_MAX = 80
export const MAX_CARDIO_MIN = 600

const weekdayOf = iso => new Date(iso + 'T12:00:00').getDay()
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** A plan slot or log entry with nothing in it that the app did not put there. */
export function cleanCardio(c) {
  const mod = text(c && c.mod, 40)
  const min = Math.min(MAX_CARDIO_MIN, Math.round(Number(c && c.min)) || 0)
  if (!mod || min < 1) return null
  const out = { mod, min }
  const dist = Math.round((Number(c.dist) || 0) * 100) / 100
  if (dist > 0) out.dist = Math.min(999, dist)
  const note = text(c.note, CARDIO_NOTE_MAX)
  if (note) out.note = note
  return out
}

/** What the plan asks for on the weekday of `iso`, or null. */
export function cardioPlanFor(S, iso) {
  const slot = S && S.cardio && S.cardio[weekdayOf(iso)]
  return slot ? cleanCardio(slot) : null
}

/** Everything logged on one day, in the order it was logged. */
export const cardioOn = (S, iso) => ((S && S.cardioLog) || []).filter(c => c && c.d === iso)

/** Minutes and sessions in the Monday-to-Sunday week that contains `iso`. */
export function cardioWeek(S, iso) {
  const day = new Date(iso + 'T12:00:00')
  const mon = new Date(day); mon.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const from = isoOf(mon), to = isoOf(sun)
  const hits = ((S && S.cardioLog) || []).filter(c => c && c.d >= from && c.d <= to)
  return { min: hits.reduce((n, c) => n + (c.min || 0), 0), sessions: hits.length }
}

/** How many weekdays the plan puts cardio on. */
export const cardioDaysPlanned = S => Object.values((S && S.cardio) || {}).filter(c => cleanCardio(c)).length

/** "Incline walk · 20 min · zone 2" — one line for a slot or an entry. `unit` is km or mi. */
export function cardioLine(c, unit) {
  if (!c) return ''
  return [c.mod, c.min + ' min', c.dist > 0 ? c.dist + ' ' + (unit || 'km') : null, c.note || null].filter(Boolean).join(' · ')
}

/** Which icon reads as this modality. */
export const cardioIcon = mod => (/bike|cycl/i.test(mod || '') ? 'bike' : /swim/i.test(mod || '') ? 'swim' : 'figureRun')
