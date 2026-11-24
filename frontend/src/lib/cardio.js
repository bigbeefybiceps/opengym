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
//   S.cardio    { [weekday 0-6]: [{ mod, min, note? }, …] }   the plan — one or more a day
//               (a single object is the older shape, still read as a list of one)
//   S.cardioLog [{ id, d, mod, min?, dist?, note? }]          what was done
//
// The minutes are optional: sprints, intervals or a hill session are planned and logged by
// what they are, not by a clock. Only the kind of cardio is required.
import { isoOf } from './format.js'

export const MODALITIES = ['Incline walk', 'Treadmill run', 'Bike', 'Stair climber', 'Rower', 'Elliptical', 'Outdoor walk', 'Outdoor run', 'Swim']
export const CARDIO_NOTE_MAX = 80
export const MAX_CARDIO_MIN = 600
export const MAX_CARDIO_PER_DAY = 4

const weekdayOf = iso => new Date(iso + 'T12:00:00').getDay()
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** A plan slot or log entry with nothing in it that the app did not put there. */
export function cleanCardio(c) {
  const mod = text(c && c.mod, 40)
  if (!mod) return null
  const min = Math.max(0, Math.min(MAX_CARDIO_MIN, Math.round(Number(c.min)) || 0))
  const out = { mod }
  if (min > 0) out.min = min
  const dist = Math.round((Number(c.dist) || 0) * 100) / 100
  if (dist > 0) out.dist = Math.min(999, dist)
  const note = text(c.note, CARDIO_NOTE_MAX)
  if (note) out.note = note
  return out
}

/** The sessions planned for weekday `day` (0-6), in order. Accepts the older single-slot shape. */
export function cardioSlots(S, day) {
  const raw = S && S.cardio && S.cardio[day]
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).map(cleanCardio).filter(Boolean)
}
/** Every session the plan asks for on the weekday of `iso`. */
export const cardioPlansFor = (S, iso) => cardioSlots(S, weekdayOf(iso))
/** The first session the plan asks for on the weekday of `iso`, or null. */
export const cardioPlanFor = (S, iso) => cardioPlansFor(S, iso)[0] || null
/**
 * The planned sessions still to log on `iso`: one logged entry ticks off one planned session,
 * whatever it turned out to be — the order they are planned in is the order they are ticked.
 */
export const cardioStillPlanned = (S, iso) => cardioPlansFor(S, iso).slice(cardioOn(S, iso).length)

/** Add (index null) or replace a planned session on weekday `day`. Call inside store.update. */
export function setCardioSlot(s, day, index, slot) {
  const clean = cleanCardio(slot)
  if (!clean) return false
  const list = cardioSlots(s, day)
  if (index == null || index >= list.length) { if (list.length >= MAX_CARDIO_PER_DAY) return false; list.push(clean) }
  else list[index] = clean
  s.cardio = s.cardio || {}
  s.cardio[day] = list
  return true
}
/** Remove one planned session from weekday `day`. */
export function removeCardioSlot(s, day, index) {
  const list = cardioSlots(s, day)
  list.splice(index, 1)
  s.cardio = s.cardio || {}
  if (list.length) s.cardio[day] = list; else delete s.cardio[day]
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
export const cardioDaysPlanned = S => [0, 1, 2, 3, 4, 5, 6].filter(d => cardioSlots(S, d).length).length
/** How many sessions a week the plan asks for. */
export const cardioSessionsPlanned = S => [0, 1, 2, 3, 4, 5, 6].reduce((n, d) => n + cardioSlots(S, d).length, 0)

/** "Incline walk · 20 min · zone 2" — one line for a slot or an entry. `unit` is km or mi. */
export function cardioLine(c, unit) {
  if (!c) return ''
  return [c.mod, c.min > 0 ? c.min + ' min' : null, c.dist > 0 ? c.dist + ' ' + (unit || 'km') : null, c.note || null].filter(Boolean).join(' · ')
}

/** Which icon reads as this modality. */
export const cardioIcon = mod => (/bike|cycl/i.test(mod || '') ? 'bike' : /swim/i.test(mod || '') ? 'swim' : 'figureRun')
